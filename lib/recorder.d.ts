/**
 * 事件记录器：把会话事件流折算成 Run 归档。
 *
 * run 边界直接取 `turn/start` 与 `turn/end` 这一对（宿主保证成对且 turn/end 必发，
 * 出错也发），所以插件不维护自己的配对状态。
 *
 * 归档动作在 `turn/end` 触发：此时该 turn 的日志已经提交，回读正文必定完整。
 * 写入是异步的，调用方不等待；失败只记日志，不影响会话。
 */
import type { LoggerLike, PluginContextLike, SessionEventLike } from "./dsh.ts";
import type { RunBoundary } from "./events.ts";
import type { RunRecord, RunStore } from "./store.ts";
export type RecorderOptions = {
    store: RunStore;
    /** 回读某个会话的某个 turn；日志缺失时返回 undefined。 */
    loadBoundary: (sessionId: string, turn: number) => Promise<RunBoundary | undefined>;
    /** 返回 true 的会话不归档：它的过程另有专用存储，不需要二次归档。 */
    skipSession?: (sessionId: string) => boolean;
    logger?: LoggerLike;
    /** 归档完成后回调（用于排队摘要）。 */
    onArchived?: (record: RunRecord, boundary: RunBoundary) => void;
};
export declare class RunRecorder {
    private readonly store;
    private readonly loadBoundary;
    private readonly skipSession;
    private readonly logger;
    private readonly onArchived;
    private readonly controller;
    /** 归档任务的串行链：回读日志 + 落库都排在同一条链上。 */
    private chain;
    private closed;
    private lastError;
    constructor(options: RecorderOptions);
    get error(): string | undefined;
    /**
     * 收一条会话事件。
     *
     * 只在 `turn/end` 上动手：turn/start 之后的正文可能还在写，
     * 而 turn/end 提交时该 turn 的事件已经齐全。
     */
    capture(session: {
        id?: string;
        header?: {
            cwd?: string;
        };
    }, event: SessionEventLike): void;
    /** 回读该会话日志，切出目标 turn 并归档。 */
    private archive;
    /** 等所有排队中的归档落盘。 */
    drain(): Promise<void>;
    /**
     * 停止接收新事件，并等已收下的归档落盘。
     *
     * 必须等：归档是异步的，回读正文要花时间。若不等就返回，宿主会先关掉存储域，
     * 正在排队的写入就会被 `domain is closed` 拒绝。
     */
    close(): Promise<void>;
}
/**
 * 订阅宿主会话事件流。
 *
 * 必须带 `{global: true}`：默认作用域过滤只把「进入本上下文」的会话事件送给监听器，
 * 而插件要记录全部会话。
 */
export declare function attachRecorder(ctx: PluginContextLike, recorder: RunRecorder): void;
