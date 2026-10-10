import type { MessageLike, SessionEventLike } from "./dsh.ts";
export type RunStatus = "running" | "completed" | "failed" | "interrupted";
export type RunMessage = {
    /** 1 起的位置序号，构成 rN/mK 里的 K。 */
    position: number;
    /** 会话日志内的 seq，用于回读正文。 */
    seq: number;
    role: "user" | "assistant" | "tool";
    /** 消息自身 id（MessageId）；legacy 全局 m 号与 UUID 靠它解析。 */
    id: string;
    /** tool 消息对应的工具名。 */
    toolName?: string;
    message: MessageLike;
};
export type RunBoundary = {
    turn: number;
    startSeq: number;
    endSeq: number;
    /** turn/start 的事件时间（Unix epoch ms）。 */
    startTime: number;
    /** turn/end 的事件时间（Unix epoch ms）。 */
    endTime: number;
    status: RunStatus;
    /** turn/end 的失败原因文本；成功为空。 */
    error: string;
    messages: RunMessage[];
    /** 首条用户文本，作为摘要缺失时的回退目标。 */
    goal: string;
};
/**
 * 扫描整份事件日志，按 turn 切出每个 run 的消息与边界。
 * 只收完整的 turn（同时见到 turn/start 与 turn/end）。
 */
export declare function foldRuns(events: readonly SessionEventLike[]): RunBoundary[];
