/**
 * dsh-recall：把 DSH 的每个 turn 归档成一条 Run，并让 Agent 检索自己的执行历史。
 *
 * 三条边界：
 * - **run 边界** = 一个 turn。宿主保证 `turn/start` 与 `turn/end` 成对且后者必发，
 *   插件不维护配对状态。
 * - **正文** 不落本插件：`ctx.sessionQuery.readSession()` 回读宿主自己的会话日志，
 *   同一份对话不存两遍。
 * - **摘要** 在 Run 归档后异步排队，失败只记 `summaryError`，不影响归档本身。
 *
 * 本文件不 import 任何 `@deepseek-ai/*` 运行时包（只 import schemastery 取配置 schema），
 * 官方包只随 DSH 安装分发，把它们的运行时版本写进插件会锁死兼容性。
 */
import Schema from "@deepseek-ai/schemastery";
import { runRunsCommand, RECALL_COMMAND_DESCRIPTION } from "./command.js";
import { Config, normalizeConfig } from "./config.js";
import { runArchiveDomain } from "./domain.js";
import { Archive } from "./find.js";
import { RunRecorder } from "./recorder.js";
import { installRemote } from "./remote.js";
import { RunStore } from "./store.js";
import { Summarizer } from "./summary.js";
import { createForgetTool, createRecallMessageTool, createRecallTool, } from "./tools.js";
export const name = "dsh-recall";
/** 归档域与正文回读是硬依赖；其余服务缺失时降级而不是不加载。 */
export const inject = ["storageDomain", "sessionQuery"];
export { Config };
export function apply(ctx, config) {
    const logger = ctx.logger;
    const current = () => normalizeConfig(config);
    let runtime;
    let failure;
    // 事件订阅尽早挂上：turn/end 可能在任何服务就绪前到达。
    const pending = [];
    ctx.on("session/event", ((session, event) => {
        if (runtime === undefined) {
            pending.push({ session, event });
            return;
        }
        runtime.recorder.capture(session, event);
    }), { global: true });
    const ready = start(ctx, current, logger).then((value) => {
        runtime = value;
        const queued = pending.splice(0, pending.length);
        for (const item of queued)
            value.recorder.capture(item.session, item.event);
        registerTools(ctx, () => runtime, () => failure, value);
        registerCommand(ctx, () => runtime, () => failure, current, value);
        // Web 设置页的搜索界面走这条桥；服务缺失时注册失败只会降级，
        // 不影响归档与模型工具。
        try {
            installRemote(ctx, () => runtime, () => failure);
        }
        catch (error) {
            logger?.warn?.("Remote 桥注册失败（设置页搜索不可用）：%s", String(error?.message ?? error));
        }
        return value;
    });
    void ready.catch((error) => {
        failure = String(error?.message ?? error);
        logger?.error?.("recall 初始化失败：%s", failure);
    });
    // 归档与摘要都是 turn/end 之后的异步尾巴，不属于 agent 的活动，因此
    // `agent.whenIdle()` 不会等它们。启动器在退出前会 await 一次
    // `sessions.flush(session)`（headless 见 dsh-headless 的 run 流程），
    // 这是「进程还活着、适配器还没卸载」的最后时机 —— 不在这里排空，
    // 摘要就会落在插件树卸载之后，撞上 `no adapter registered for provider`。
    //
    // 该监听器任何一次 flush 都会跑（每个 step 与每次工具调用前各一次；
    // 若无待办则立即返回）。它必须**永不抛错**：checkpoint 策略是 fail-closed 的，
    // 抛错会连带取消发起方的模型请求或工具调用。
    ctx.on("session/flush", (() => {
        // flush() 会 await 监听器返回的 Promise，所以必须把它交出去。
        return drain(ready, logger);
    }), { global: true });
    ctx.effect(() => async () => {
        const value = await ready.catch(() => undefined);
        if (value === undefined)
            return;
        // 顺序要紧：先等归档跑完（它会排队摘要），再等摘要跑完，最后确保写盘。
        // 任一环节提前返回，宿主都会在这之后关掉存储域，留下写不进的尾巴。
        await value.recorder.close();
        await value.summarizer.close();
        await value.store.drain();
    }, "dsh-recall.shutdown");
}
/** 排空归档链与摘要链，并等它们写盘。只等待调用瞬间已入队的工作。 */
function drain(ready, logger) {
    return ready
        .then(async (value) => {
        await value.recorder.drain();
        await value.summarizer.drain();
        await value.store.drain();
    })
        .catch((error) => {
        logger?.warn?.("recall 等待归档落盘失败：%s", String(error?.message ?? error));
    });
}
async function start(ctx, current, logger) {
    const facility = ctx.storageDomain;
    if (facility === undefined)
        throw new Error("缺少 storageDomain 服务");
    const query = ctx.sessionQuery;
    if (query === undefined)
        throw new Error("缺少 sessionQuery 服务");
    const opened = (await facility.open(runArchiveDomain));
    logger?.debug?.("recall 已打开存储域 %s", runArchiveDomain.name);
    const store = new RunStore(opened, logger);
    const archive = new Archive(store, query, logger);
    const llm = service(ctx, "llm");
    const summarizer = new Summarizer({
        llm: llm ?? missingLlm(logger),
        store,
        logger,
        limit: () => current().overviewLimit,
        enabled: () => !current().noSummary && llm !== undefined,
    });
    const recorder = new RunRecorder({
        store,
        loadBoundary: (sessionId, turn) => archive.boundaryOf(sessionId, turn),
        logger,
        onArchived: (record, boundary) => {
            if (current().noSummary)
                return;
            const route = resolveRoute(current(), boundary);
            if (route === undefined) {
                void store.saveSummaryError(record, "未配置摘要模型，且当前会话没有可用的模型路由");
                return;
            }
            summarizer.enqueue({
                record,
                goal: boundary.goal,
                loadMessages: async () => boundary.messages,
                route,
            });
        },
    });
    return { store, archive, summarizer, recorder };
}
/**
 * 读一个可选服务。
 *
 * cordis 对没写进 `inject` 的服务名是**抛错**而不是返回 `undefined`，
 * 所以可选服务只能这样取：要么拿到实现，要么拿到 `undefined`。
 */
function service(ctx, name) {
    try {
        const value = ctx.get(name);
        return value === undefined || value === null ? undefined : value;
    }
    catch {
        return undefined;
    }
}
function missingLlm(logger) {
    return {
        stream() {
            logger?.warn?.("recall 缺少 llm 服务，无法生成摘要");
            throw new Error("recall 缺少 llm 服务");
        },
    };
}
/**
 * 摘要用的模型路由。
 *
 * 优先用配置里的 provider/model；两者必须同时给出（与官方 session-title-llm 同规则）。
 * 留空则用该 turn 里实际产生回复的那个模型：assistant 消息的 `source` 记着
 * provider/model。这比查 agent 注册表可靠——注册表按会话作用域隔离，
 * 插件的全局监听器拿不到，而消息自带的路由永远在归档边界里。
 */
function resolveRoute(config, boundary) {
    const provider = config.summaryProvider;
    const model = config.summaryModel;
    if (provider !== "" && model !== "")
        return { provider, model };
    // 只给一半是配置错误：宁可不摘要，也不猜另一半。
    if (provider !== "" || model !== "")
        return undefined;
    for (const item of boundary.messages) {
        const source = item.message.source;
        if (typeof source?.provider === "string" &&
            source.provider !== "" &&
            typeof source.model === "string" &&
            source.model !== "")
            return { provider: source.provider, model: source.model };
    }
    return undefined;
}
function registerTools(ctx, runtime, failure, _value) {
    const tools = service(ctx, "tools");
    if (tools === undefined)
        return;
    const need = () => {
        const value = runtime();
        if (value === undefined)
            throw new Error(failure() ?? "Run 归档尚未就绪");
        return value;
    };
    const definitions = [
        createRecallTool(() => need().archive),
        createRecallMessageTool(() => need().archive),
        createForgetTool(() => need().store),
    ];
    for (const definition of definitions)
        tools.register(definition);
}
function registerCommand(ctx, runtime, failure, current, _value) {
    const commands = service(ctx, "commands");
    if (commands === undefined)
        return;
    commands.register({
        name: "runs",
        description: RECALL_COMMAND_DESCRIPTION,
        input: {
            hint: "search <关键词> | all | rID | rID/mID | summary rID | debug",
        },
        handler: (invocation) => {
            const value = runtime();
            if (value === undefined)
                return Promise.resolve({
                    kind: "error",
                    text: failure() ?? "Run 归档尚未就绪。",
                });
            return runRunsCommand({
                archive: () => value.archive,
                store: () => value.store,
                cwd: (call) => call.agent?.session?.header?.cwd,
                summaryError: () => value.summarizer.error,
                overviewLimit: () => current().overviewLimit,
            }, invocation);
        },
    });
}
