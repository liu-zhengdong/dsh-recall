import type { LlmLike, LoggerLike } from "./dsh.ts";
import type { RunRecord } from "./domain.ts";
import type { RunMessage } from "./events.ts";
import type { RunStore } from "./store.ts";
export declare const DEFAULT_OVERVIEW_LIMIT = 200;
export declare const MAX_OVERVIEW_LIMIT = 2000;
export declare const SUMMARY_TIMEOUT_MS = 60000;
export declare const SUMMARY_MAX_OUTPUT_TOKENS = 1024;
/** 摘要请求的输入预算（UTF-8 字节）。 */
export declare const SUMMARY_CONTEXT_BYTES = 48000;
/** 提示词要求不超过 limit，但模型不保证精确达标；校验额外放宽 50%。 */
export declare function overviewHardLimit(limit: number): number;
export declare function summaryPrompt(limit: number): string;
/**
 * 构造摘要用的证据文本。消息倒序取，靠近结尾的优先；超预算就截断并标记省略。
 * 思考块被过滤：私密推理不是已验证的执行证据，还会挤掉真正的结论。
 */
export declare function summaryEvidence(goal: string, messages: readonly RunMessage[], budget?: number): string;
/** 校验摘要；不合规就让调用方记失败，而不是存一段残缺文本。 */
export declare function validateSummary(value: string, limit: number): string;
export interface SummaryRoute {
    provider: string;
    model: string;
}
export type SummaryRequest = {
    record: RunRecord;
    goal: string;
    /** 正文在需要时才回读：摘要排队时还不知道何时轮到它。 */
    loadMessages: () => Promise<readonly RunMessage[]>;
    route: SummaryRoute;
};
/**
 * 摘要队列：串行跑，一个失败不拖累后面的。
 * 关闭时先等当前任务，再 abort。
 */
export declare class Summarizer {
    private readonly llm;
    private readonly store;
    private readonly logger;
    private readonly limit;
    private readonly enabled;
    private readonly controller;
    private chain;
    private lastError;
    constructor(options: {
        llm: LlmLike;
        store: RunStore;
        logger?: LoggerLike;
        limit: () => number;
        enabled: () => boolean;
    });
    get error(): string | undefined;
    /** 排队一次摘要；调用方不等待。 */
    enqueue(request: SummaryRequest): void;
    private run;
    private generate;
    drain(): Promise<void>;
    /**
     * 关闭：先等排队中的摘要跑完，再中止。
     *
     * 顺序不能反：`run()` 开头就看 `aborted` 直接返回，先 abort 会把
     * 还没轮到、但已经排队的摘要整批丢掉。等有上限，摘要自己有超时兜底。
     */
    close(): Promise<void>;
}
