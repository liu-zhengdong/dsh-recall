import type { PluginConfig, StartupRecallScope } from "./config.ts";
import type { RunRecord } from "./domain.ts";
import type { AgentLike, InjectedUserMessageLike, LoggerLike, PluginContextLike } from "./dsh.ts";
/** 等归档就绪的上限。创建流程会等这个监听器，不能再长。 */
export declare const STARTUP_RECALL_READY_TIMEOUT_MS = 500;
/** 整段索引的 UTF-8 上限。超出时从最旧的一条开始丢。 */
export declare const STARTUP_RECALL_MAX_BYTES: number;
export interface StartupStoreLike {
    list(): RunRecord[];
}
/** 归档就绪之后启动注入能看到的运行时。复盘归属不在 `agent/created` 载荷里。 */
export interface StartupRuntimeLike {
    store: StartupStoreLike;
    dream?: {
        isReviewSession(sessionId: string): boolean;
    };
}
export interface StartupRecallDeps {
    ready: Promise<StartupRuntimeLike>;
    current: () => PluginConfig;
    logger?: LoggerLike;
    timeoutMs?: number;
    createId?: () => string;
}
interface CreatedPayload {
    agent?: AgentLike;
    source?: string;
    signal?: AbortSignal;
}
/**
 * 只注入顶层的全新会话。
 * 子代理、fork（`isSeeded`）、续接、清空、压缩都跳过。复盘会话要等存储就绪后再判。
 */
export declare function isStartupRecallTarget(source: string, agent: AgentLike): boolean;
/**
 * `store.list()` 已经按序号从新到旧排过，墓碑不在这张表里。
 * 当前目录不够 N 条时不拿别的目录补。
 */
export declare function selectStartupRuns(records: readonly RunRecord[], options: {
    cwd: string;
    count: number;
    scope: StartupRecallScope;
}): RunRecord[];
/** 拼索引正文。没有行，或最新的一行自己就超过上限时，返回 undefined。 */
export declare function composeStartupRecall(records: readonly RunRecord[], scope: StartupRecallScope, overviewLimit: number): string | undefined;
export declare function startupRecallMessage(text: string, id: string): InjectedUserMessageLike;
/**
 * 处理一次 `agent/created`。任何失败都吞掉：这个监听器抛错会让 Agent 创建失败。
 */
export declare function deliverStartupRecall(deps: StartupRecallDeps, payload: CreatedPayload): Promise<void>;
export declare function installStartupRecall(ctx: PluginContextLike, deps: StartupRecallDeps): void;
export {};
