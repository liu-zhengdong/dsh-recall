/**
 * 会话开始时，把最近若干条 Run 的索引注入主 Agent，只此一次。
 *
 * 钩子是 `agent/created`。宿主把这个事件标成 serial：监听器返回的 Promise
 * 结束之前，排队的输入不会放行。所以这里必须自己收口——超时、归档没就绪、
 * 一条 Run 都没有，都只是跳过，不能把异常抛回创建流程。
 *
 * 宿主 0.2.0-rc.2 的事实（`dsh-agent-loop` 与 `session-controller`）：
 * - `create` / `createAgent` 发布的 source 固定是 `startup`，fork 也走这条
 *   （带 seed、`isSeeded: true`），没有单独的 source。
 * - `resume` 发布 `resume`。`clear` / `compact` 在类型里，该版本没有调用点。
 * - 子代理由 `dsh-subagent` 标成 `origin: "subagent"`，并把深度写进
 *   `header.delegationDepth` 与 `options.subagentDepth`。
 *   `agents.roots()` 只表示运行时没有父 Agent，fork 和复盘会话也算 root，
 *   所以不用它区分子代理。
 */
import { randomUUID } from "node:crypto";
import { overviewLine, startupRecallLead } from "./wording.js";
/** 等归档就绪的上限。创建流程会等这个监听器，不能再长。 */
export const STARTUP_RECALL_READY_TIMEOUT_MS = 500;
/** 整段索引的 UTF-8 上限。超出时从最旧的一条开始丢。 */
export const STARTUP_RECALL_MAX_BYTES = 3 * 1024;
/** 只注入顶层会话的首次创建。子代理、续接、清空、压缩都跳过。 */
export function isStartupRecallTarget(source, agent) {
    return source === "startup" && !isSubagent(agent);
}
/**
 * `store.list()` 已经按序号从新到旧排过，墓碑不在这张表里。
 * 当前目录不够 N 条时不拿别的目录补。
 */
export function selectStartupRuns(records, options) {
    const matched = options.scope === "all"
        ? records
        : records.filter((record) => record.cwd === options.cwd);
    return matched.slice(0, options.count);
}
/** 拼索引正文。没有行，或最新的一行自己就超过上限时，返回 undefined。 */
export function composeStartupRecall(records, scope, overviewLimit) {
    const lines = records.map((record) => startupRecallLine(record, scope, overviewLimit));
    while (lines.length > 0 && utf8Length(renderStartupRecall(lines, scope)) > STARTUP_RECALL_MAX_BYTES) {
        lines.pop();
    }
    return lines.length === 0 ? undefined : renderStartupRecall(lines, scope);
}
export function startupRecallMessage(text, id) {
    return Object.freeze({
        id,
        role: "user",
        content: Object.freeze([Object.freeze({ type: "text", text })]),
        source: Object.freeze({ kind: "dsh-recall", form: "recall" }),
    });
}
/**
 * 处理一次 `agent/created`。任何失败都吞掉：这个监听器抛错会让 Agent 创建失败。
 */
export async function deliverStartupRecall(deps, payload) {
    try {
        const config = deps.current();
        if (!config.startupRecall)
            return;
        const agent = payload.agent;
        const source = payload.source;
        if (agent === undefined || source === undefined)
            return;
        if (!isStartupRecallTarget(source, agent))
            return;
        if (payload.signal?.aborted)
            return;
        const runtime = await waitForReady(deps.ready, deps.timeoutMs ?? STARTUP_RECALL_READY_TIMEOUT_MS);
        if (runtime === undefined || payload.signal?.aborted)
            return;
        const selected = selectStartupRuns(runtime.store.list(), {
            cwd: agent.session?.header?.cwd ?? "",
            count: config.startupRecallCount,
            scope: config.startupRecallScope,
        });
        const text = composeStartupRecall(selected, config.startupRecallScope, config.overviewLimit);
        if (text === undefined || typeof agent.inject !== "function")
            return;
        agent.inject(startupRecallMessage(text, (deps.createId ?? randomUUID)()));
    }
    catch (error) {
        deps.logger?.warn?.("recall 启动注入失败：%s", String(error?.message ?? error));
    }
}
export function installStartupRecall(ctx, deps) {
    ctx.on("agent/created", ((payload) => deliverStartupRecall(deps, createdPayload(payload))), { global: true });
}
function isSubagent(agent) {
    const header = agent.session?.header;
    if (header?.origin === "subagent")
        return true;
    return depthOf(header?.delegationDepth) > 0 || depthOf(agent.options?.subagentDepth) > 0;
}
function depthOf(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}
function startupRecallLine(record, scope, overviewLimit) {
    const parts = [`r${record.ordinal}`, record.startedAt, record.status];
    if (record.status === "failed") {
        const error = oneLine(record.error.split(/\r?\n/u)[0] ?? "");
        if (error !== "")
            parts.push(error);
    }
    if (scope === "all")
        parts.push(record.cwd);
    parts.push(oneLine(overviewLine(record.overview, record.goal, overviewLimit)));
    return parts.join(" · ");
}
function renderStartupRecall(lines, scope) {
    return `${startupRecallLead(lines.length, scope)}\n${lines.join("\n")}`;
}
function oneLine(text) {
    return text.replace(/\s+/gu, " ").trim();
}
function utf8Length(text) {
    return Buffer.byteLength(text, "utf8");
}
function createdPayload(value) {
    if (value === null || typeof value !== "object")
        return {};
    const record = value;
    const signal = record.signal;
    return {
        agent: typeof record.agent === "object" && record.agent !== null
            ? record.agent
            : undefined,
        source: typeof record.source === "string" ? record.source : undefined,
        signal: signal !== null && typeof signal === "object" && "aborted" in signal
            ? signal
            : undefined,
    };
}
function waitForReady(ready, timeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        };
        // 不 unref：创建流程只等这个 Promise。定时器若是唯一的待办，
        // 也必须能把监听器叫醒，否则超时永远不会发生。
        const timer = setTimeout(() => finish(undefined), timeoutMs);
        ready.then((value) => finish(value), () => finish(undefined));
    });
}
