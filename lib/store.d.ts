/**
 * Run 记录仓库：把归档域包成「按 rN 序号取用」的仓储。
 *
 * 序号在写入时从已存记录推导（`max(ordinal) + 1`），不另存计数器。
 * 原因是两条写路径都要在同一个 turn 收尾时竞争：先用域 global 计数会变成
 * 「先写记录、再写计数」两次写，第二次写在进程收尾阶段会被已关闭的域拒绝
 * （`domain 'run_archive' is closed`），结果每条记录都拿到序号 1。
 * 单次写 + 纯函数推导就没有这个窗口。
 *
 * 推导与写入在同一条 promise 链上串行，因为 turn 结束事件是并发的：
 * 两个会话可能同时收尾，不能让它们拿到同一个序号。
 */
import { type RunRecord } from "./domain.ts";
import type { DomainLike, LoggerLike } from "./dsh.ts";
export type { RunRecord, TombstoneRecord } from "./domain.ts";
export interface RunSource {
    sessionId: string;
    cwd: string;
    agentId: string;
}
export type DeleteResult = {
    deleted: string[];
    alreadyDeleted: string[];
};
export declare class RunStore {
    private readonly runs;
    private readonly tombstones;
    private readonly logger;
    /** 序号分配与写入的串行链。 */
    private chain;
    constructor(domain: DomainLike, logger?: LoggerLike);
    /** 串行执行一次写操作；失败不阻断后续写。 */
    private enqueue;
    /** 全部 Run，按序号从新到旧。 */
    list(): RunRecord[];
    /** 按序号或 UUID 取一条 Run。 */
    get(id: string): RunRecord | undefined;
    /** 归档一个 turn；同一个 turn 重复归档是幂等的（同 key 覆盖）。 */
    record(boundary: {
        turn: number;
        startedAt: string;
        endedAt: string;
        status: RunRecord["status"];
        error: string;
        goal: string;
    }, source: RunSource): Promise<RunRecord>;
    /**
     * 下一个可用序号：已存记录里最大的 ordinal 加一。
     *
     * 墓碑不参与推导：删除过的序号不复用，避免旧引用指向新记录。
     */
    private nextOrdinal;
    /** 写入摘要；失败原因与摘要互斥。 */
    saveOverview(record: RunRecord, overview: string): Promise<void>;
    /** 记录摘要失败；已有摘要时不动它。 */
    saveSummaryError(record: RunRecord, error: string): Promise<void>;
    /**
     * 删除指定的 Run。全部 id 先校验再动手：未知或已删的 id 让整批拒绝，
     * 不做部分删除；重复删除是幂等的。
     */
    remove(ids: readonly string[], reason: string): Promise<DeleteResult>;
    /** 找到某个 id（序号或 UUID）对应的记录 key。 */
    private keyOf;
    /** 等所有排队中的写入落盘。 */
    drain(): Promise<void>;
    /** 摘要失败的记录数，供 /runs 诊断。 */
    countSummaryFailures(): number;
    /** 已删除的墓碑数。 */
    tombstoneCount(): number;
    log(message: string): void;
}
/** `r12` / `12` → 12；UUID 或其他形式 → undefined。 */
export declare function parseOrdinal(id: string): number | undefined;
