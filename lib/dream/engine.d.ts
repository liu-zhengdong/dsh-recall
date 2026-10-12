import type { PluginConfig } from "../config.ts";
import type { RunRecord } from "../domain.ts";
import type { AgentPresetsLike, AgentsLike, LoggerLike, ModelRouteLike, SessionLike, SessionEventLike, SessionQueryLike, SessionsLike } from "../dsh.ts";
import type { Archive } from "../find.ts";
import { type DreamJob } from "./domain.ts";
import { DreamStore } from "./store.ts";
export interface DreamHost {
    agents?: AgentsLike;
    sessions?: SessionsLike;
    sessionQuery: SessionQueryLike;
    /**
     * 宿主 preset 注册表，惰性读取（apply 时兄弟插件可能还没激活）。
     * 复盘会话自己建会话，拿不到宿主给普通会话挂的 preset，必须在这里自己补上；
     * 缺这个服务时复盘会话只有宿主层工具，没有 bash 与文件工具。
     */
    agentPresets?: () => AgentPresetsLike | undefined;
    /** 宿主默认模型路由；dreamProvider/dreamModel 留空时兜底。 */
    defaultModel?: () => ModelRouteLike | undefined;
    logger?: LoggerLike;
}
export interface DreamEngineOptions {
    host: DreamHost;
    current: () => PluginConfig;
    store: DreamStore;
    runs: () => RunRecord[];
    archive: Pick<Archive, "boundaryOf">;
}
export interface DreamStatus {
    enabled: boolean;
    paused: boolean;
    threshold: number;
    pending: {
        cwd: string;
        count: number;
        cursor: number;
    }[];
    running: DreamJob | null;
    lastAttempt: string | null;
    sessionIds: string[];
    error: string | null;
}
/** 一个进程一个执行者；模型生命周期不进入串行控制队列或 session/flush。 */
export declare class DreamEngine {
    private readonly options;
    private readonly pending;
    private readonly knownRuns;
    private readonly headers;
    private readonly origins;
    private readonly turns;
    private readonly listeners;
    private readonly operations;
    private chain;
    private initialization?;
    private active?;
    private timer?;
    private closed;
    private ready;
    private lastError;
    constructor(options: DreamEngineOptions);
    get store(): DreamStore;
    /**
     * 这个会话是本插件创建的复盘会话。
     *
     * `begin` 在 `agents.create` 之前把复盘会话写成它自己的根（`rootSessionId === sessionId`）。
     * 从它 fork 出去的会话记的是复盘会话的 id，不是自己，因此不会被认成复盘会话。
     */
    isReviewSession(sessionId: string): boolean;
    notify(): void;
    track<T>(operation: () => Promise<T>): Promise<T>;
    subscribe(listener: () => void): () => void;
    private changed;
    private enqueue;
    private report;
    initialize(): Promise<void>;
    /** 归档回调：只更新这一条记录，不重新调用 runs()。 */
    archived(record: RunRecord): void;
    sessionCreated(session: SessionLike): void;
    /** 同步捕获 terminal 事实；异步落盘由独立控制队列负责。 */
    capture(session: SessionLike, event: SessionEventLike): void;
    private originOf;
    private ensureHeader;
    private addPending;
    private removeSession;
    status(): DreamStatus;
    list(options?: {
        offset?: number;
        limit?: number;
        cwd?: string;
    }): {
        items: DreamJob[];
        hasMore: boolean;
    };
    private choose;
    private schedule;
    run(cwd?: string): Promise<DreamJob>;
    retry(id?: string): Promise<DreamJob>;
    private begin;
    private launch;
    private settle;
    private finish;
    stop(): Promise<DreamStatus>;
    pause(value?: boolean): Promise<DreamStatus>;
    sessionJob(sessionId: string): DreamJob;
    validateSources(job: DreamJob, sources: readonly string[], signal?: AbortSignal): Promise<void>;
    complete(sessionId: string, input: unknown, signal?: AbortSignal): Promise<DreamJob>;
    /** 仅取消自己的活动；不等待长模型/flush，晚到的监测回调不会继续写域。 */
    close(): Promise<void>;
}
