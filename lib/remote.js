import { dreamStatusView, dreamSummary } from "./dream/view.js";
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";
const NAMESPACE = "recall";
const SERVICE_KEY = "dsh-recall/remote";
/** Archive / RunStore 尚未就绪时的统一错误文案。 */
const NOT_READY = "Run 归档尚未就绪";
function markRemote(prototype, entries) {
    const methods = entries.map((entry) => Object.freeze({
        method: entry.method,
        ...(entry.mode === undefined ? {} : { mode: entry.mode }),
        invocation: Object.freeze({ kind: "direct" }),
    }));
    Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
        configurable: true,
        value: Object.freeze({
            version: 1,
            methods: Object.freeze(methods),
        }),
    });
}
/** 手写 JSON 化：宿主没有 schemastery，Gateway 只做无损 JSON 校验。 */
function structured(value) {
    return JSON.parse(JSON.stringify(value ?? null));
}
export class RecallRemoteService {
    ctx;
    runtime;
    failure;
    constructor(ctx, runtime, failure) {
        this.ctx = ctx;
        this.runtime = runtime;
        this.failure = failure;
        this.typertRemote = Object.freeze({
            service: this,
            serviceKey: SERVICE_KEY,
            namespace: NAMESPACE,
        });
    }
    /** Gateway 的发现绑定；见文件头。 */
    typertRemote;
    needDream() {
        const value = this.runtime();
        if (value === undefined)
            throw new Error(this.failure() ?? NOT_READY);
        return value.dream;
    }
    dreamStatus() {
        return structured(dreamStatusView(this.needDream().status()));
    }
    dreams(args) {
        const input = (args ?? {});
        const offset = input.offset ?? 0;
        const limit = input.limit ?? 30;
        if (!Number.isSafeInteger(offset) || offset < 0 ||
            !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
            throw new Error("复盘分页需要非负 offset，以及 1–50 的 limit");
        const page = this.needDream().list({ offset: offset, limit: limit });
        return structured({ items: page.items.map(dreamSummary), hasMore: page.hasMore });
    }
    dreamDetail(id) {
        if (typeof id !== "string")
            throw new Error("id 必须是复盘 ID");
        const job = this.needDream().store.get(id);
        if (!job)
            throw new Error(`没有复盘 ${id}`);
        return structured(job);
    }
    async dreamRun(cwd) {
        if (cwd !== undefined && typeof cwd !== "string")
            throw new Error("cwd 必须是目录字符串");
        return structured(dreamSummary(await this.needDream().run(cwd)));
    }
    async dreamStop() {
        return structured(dreamStatusView(await this.needDream().stop()));
    }
    async dreamPause(paused) {
        if (typeof paused !== "boolean")
            throw new Error("paused 必须是布尔值");
        return structured(dreamStatusView(await this.needDream().pause(paused)));
    }
    async dreamRetry(id) {
        if (typeof id !== "string")
            throw new Error("id 必须是复盘 ID");
        return structured(dreamSummary(await this.needDream().retry(id)));
    }
    /** 单个脏位合并变化，慢客户端不会堆积历史快照；传输取消同时释放订阅。 */
    async *dreamWatch(signal) {
        const engine = this.needDream();
        let dirty = true;
        let wake;
        const changed = () => { dirty = true; wake?.(); };
        const unsubscribe = engine.subscribe(changed);
        signal.addEventListener("abort", changed, { once: true });
        try {
            while (!signal.aborted) {
                if (!dirty)
                    await new Promise((resolve) => { wake = resolve; });
                wake = undefined;
                if (signal.aborted)
                    break;
                dirty = false;
                yield { changed: true };
            }
        }
        finally {
            unsubscribe();
            signal.removeEventListener("abort", changed);
        }
    }
    /** 全部 Run（不含正文），供列表页一次拉全。 */
    runs() {
        const value = this.runtime();
        if (value === undefined)
            throw new Error(this.failure() ?? NOT_READY);
        return structured(value.store.list());
    }
    /** 搜索：query 空则列概览；分页参数原样透传给 Archive.find。 */
    search(args, signal) {
        const value = this.runtime();
        if (value === undefined)
            return Promise.reject(new Error(this.failure() ?? NOT_READY));
        return value.archive
            .find((args ?? {}), signal)
            .then((result) => structured(result));
    }
    /** 读一条 Run 或一条消息的全文；按 Archive.detail 的 12KB 分页返回。 */
    detail(args) {
        const value = this.runtime();
        if (value === undefined)
            return Promise.reject(new Error(this.failure() ?? NOT_READY));
        return value.archive
            .detail((args ?? {}))
            .then((result) => structured(result));
    }
    /** 删除；store.remove 整批校验，任一未知 ID 则整批拒绝。 */
    forget(ids, reason) {
        const value = this.runtime();
        if (value === undefined)
            return Promise.reject(new Error(this.failure() ?? NOT_READY));
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
            throw new Error("ids 必须是字符串数组");
        return value.store
            .remove(ids, typeof reason === "string" && reason !== "" ? reason : "设置页手动删除")
            .then((result) => structured(result));
    }
}
markRemote(RecallRemoteService.prototype, [
    { method: "runs" },
    { method: "search" },
    { method: "detail" },
    { method: "forget" },
    { method: "dreamStatus" },
    { method: "dreams" },
    { method: "dreamDetail" },
    { method: "dreamRun" },
    { method: "dreamStop" },
    { method: "dreamPause" },
    { method: "dreamRetry" },
    { method: "dreamWatch", mode: "stream" },
]);
/**
 * 注册 Remote 命名空间。
 *
 * Gateway 通过 `ctx.provide` 的服务发现读到 typertRemote 绑定；
 * 客户端半边按同一个 NAMESPACE 生成 `remote.<NAMESPACE>` 的调用入口。
 */
export function installRemote(ctx, runtime, failure) {
    ctx.provide(SERVICE_KEY, new RecallRemoteService(ctx, runtime, failure));
    ctx.logger?.warn?.("Remote 命名空间 %s 已挂载（runs/search/detail/forget）", NAMESPACE);
}
