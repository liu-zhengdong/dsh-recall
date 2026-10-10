import type { SessionQueryLike } from "./dsh.ts";
import { type RunBoundary } from "./events.ts";
import type { RunStore } from "./store.ts";
import { clean } from "./wording.ts";
/** 单页正文预算（UTF-8 字节）。 */
export declare const OUTPUT_BYTES = 12000;
/** 一条消息正文投影的上限；超过就拒绝，避免一次调用撑爆进程。 */
export declare const MAX_PROJECTION_BYTES: number;
/** 一页最多列出的 Run 数。 */
export declare const DEFAULT_LIMIT = 20;
/** 扫描上限，防止一次调用把整个归档读完。 */
export declare const MAX_SCAN = 250;
export type FindArgs = {
    query?: string;
    scope?: "all" | "summary" | "content";
    cwd?: string;
    since?: string;
    until?: string;
    id?: string;
    limit?: number;
    cursor?: string;
};
export type DetailArgs = {
    id: string;
    format?: "text" | "raw";
    cursor?: string;
};
export type Choice = {
    id: string;
    label: string;
};
/** 一条消息的结构化摘要；readRun 结果里与 text 并存，供 UI 直接渲染。 */
export type MessageSummary = {
    id: string;
    position: number;
    role: string;
    toolName?: string;
    preview: string;
};
export type FindResult = {
    text: string;
    displayText: string;
    next?: FindArgs;
    choices: Choice[];
    /** 仅 readRun（按 id 展开 Run）时返回：本页消息的结构化列表。 */
    messages?: MessageSummary[];
};
export type DetailResult = {
    text: string;
    next?: DetailArgs;
    /** 未加分隔线包装的正文本页，供 UI 直接展示。 */
    body?: string;
    role?: string;
};
/** 游标就是下一页的参数本身；不透明化没有收益，反而挡住手工续页。 */
export declare function encodeCursor(args: FindArgs | DetailArgs | {
    offset: number;
}): string;
export declare function decodeCursor(cursor: string): Record<string, unknown>;
/** 正文按字节切页，不切开代理对。 */
export declare function page(body: string, at: number): {
    part: string;
    end: number;
};
export declare class Archive {
    private readonly store;
    private readonly query;
    private readonly logger;
    constructor(store: RunStore, query: SessionQueryLike, logger?: {
        warn?(format: unknown, ...param: unknown[]): void;
    });
    /** 读取一个 run 的完整消息序列；日志读不到时返回 undefined。 */
    private load;
    /** 回读某个会话的某个 turn；归档时用来取边界与正文。 */
    boundaryOf(sessionId: string, turn: number, signal?: AbortSignal): Promise<RunBoundary | undefined>;
    find(args: FindArgs, signal?: AbortSignal): Promise<FindResult>;
    /** 续页参数：沿用原筛选条件，只把游标推进到下一页起点。 */
    private nextPage;
    /** 在正文里找命中位置，返回可读的命中行。 */
    private matchContent;
    /** 不带 query 或 scope=summary：列出 Run 概览。 */
    private renderRuns;
    /** 展开一个 Run 的消息列表。 */
    private readRun;
    private cursorOffset;
    /** 读取一条消息的全文，按 12KB 分页。 */
    detail(args: DetailArgs): Promise<DetailResult>;
    /** 解析 `r12/m3`、`m3`（本会话内不唯一，故需 Run 前缀）或消息 UUID。 */
    private resolveMessage;
}
/** 工具结果里的 choices 裁剪：只留前三条，避免把整页塞进 meta。 */
export declare function findDetails(page: FindResult): {
    page: {
        count: number;
        more: boolean;
        choices: Choice[];
    };
};
export { clean };
