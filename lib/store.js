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
import { RUNS_TABLE, TOMBSTONES_TABLE, runKey, } from "./domain.js";
export class RunStore {
    runs;
    tombstones;
    logger;
    /** 序号分配与写入的串行链。 */
    chain = Promise.resolve();
    constructor(domain, logger) {
        // 域句柄的 table() 对宿主是「按名字取表」，值的类型由域声明决定；
        // 这里在边界上收敛一次，之后的读写都按声明的记录形状进行。
        this.runs = domain.table(RUNS_TABLE);
        this.tombstones = domain.table(TOMBSTONES_TABLE);
        this.logger = logger;
    }
    /** 串行执行一次写操作；失败不阻断后续写。 */
    enqueue(task) {
        const next = this.chain.then(task, task);
        this.chain = next.catch(() => undefined);
        return next;
    }
    /** 全部 Run，按序号从新到旧。 */
    list() {
        const records = [];
        for (const [, record] of this.runs.entries())
            records.push(record);
        return records.sort((a, b) => b.ordinal - a.ordinal);
    }
    /** 按序号或 UUID 取一条 Run。 */
    get(id) {
        const ordinal = parseOrdinal(id);
        if (ordinal !== undefined) {
            for (const [, record] of this.runs.entries()) {
                if (record.ordinal === ordinal)
                    return record;
            }
            return undefined;
        }
        for (const [, record] of this.runs.entries()) {
            if (record.id === id)
                return record;
        }
        return undefined;
    }
    /** 归档一个 turn；同一个 turn 重复归档是幂等的（同 key 覆盖）。 */
    record(boundary, source) {
        return this.enqueue(async () => {
            const key = runKey(source.sessionId, boundary.turn);
            const existing = this.runs.get(key);
            if (existing !== undefined)
                return existing;
            const ordinal = this.nextOrdinal();
            const record = {
                id: crypto.randomUUID(),
                sessionId: source.sessionId,
                ordinal,
                turn: boundary.turn,
                cwd: source.cwd,
                agentId: source.agentId,
                startedAt: boundary.startedAt,
                endedAt: boundary.endedAt,
                status: boundary.status,
                error: boundary.error,
                goal: boundary.goal,
                overview: null,
                summaryError: null,
            };
            // 序号由记录本身推导，所以整个归档只有这一次写；没有第二次写，
            // 也就没有「域已关闭」把序号推进吞掉的窗口。
            await this.runs.put(key, record);
            return record;
        });
    }
    /**
     * 下一个可用序号：已存记录里最大的 ordinal 加一。
     *
     * 墓碑不参与推导：删除过的序号不复用，避免旧引用指向新记录。
     */
    nextOrdinal() {
        let maximum = 0;
        for (const [, record] of this.runs.entries()) {
            if (record.ordinal > maximum)
                maximum = record.ordinal;
        }
        for (const [, tombstone] of this.tombstones.entries()) {
            if (tombstone.ordinal > maximum)
                maximum = tombstone.ordinal;
        }
        return maximum + 1;
    }
    /** 写入摘要；失败原因与摘要互斥。 */
    saveOverview(record, overview) {
        return this.enqueue(async () => {
            const key = runKey(record.sessionId, record.turn);
            const current = this.runs.get(key);
            if (current === undefined)
                return;
            await this.runs.put(key, {
                ...current,
                overview,
                summaryError: null,
            });
        });
    }
    /** 记录摘要失败；已有摘要时不动它。 */
    saveSummaryError(record, error) {
        return this.enqueue(async () => {
            const key = runKey(record.sessionId, record.turn);
            const current = this.runs.get(key);
            if (current === undefined || current.overview !== null)
                return;
            await this.runs.put(key, { ...current, summaryError: error });
        });
    }
    /**
     * 删除指定的 Run。全部 id 先校验再动手：未知或已删的 id 让整批拒绝，
     * 不做部分删除；重复删除是幂等的。
     */
    remove(ids, reason) {
        return this.enqueue(async () => {
            const targets = [];
            const unknown = [];
            for (const id of ids) {
                const ordinal = parseOrdinal(id);
                const key = this.keyOf(ordinal, id);
                if (key === undefined) {
                    unknown.push(id);
                    continue;
                }
                const record = this.runs.get(key);
                if (record === undefined) {
                    unknown.push(id);
                    continue;
                }
                targets.push({ key, record });
            }
            if (unknown.length > 0)
                throw new Error(`未知或已删除的 Run：${unknown.join("、")}；整批未删除。`);
            const deleted = [];
            const alreadyDeleted = [];
            for (const { key, record } of targets) {
                // 先立墓碑再删记录：序号推导会看墓碑，反过来的话中途失败会让这个
                // 序号被下一条记录复用，旧引用就指到了别的 Run。
                await this.tombstones.put(key, {
                    id: record.id,
                    ordinal: record.ordinal,
                    deletedAt: new Date().toISOString(),
                    reason: reason.trim(),
                });
                const removed = await this.runs.delete(key);
                if (!removed) {
                    alreadyDeleted.push(`r${record.ordinal}`);
                    continue;
                }
                deleted.push(`r${record.ordinal}`);
            }
            return { deleted, alreadyDeleted };
        });
    }
    /** 找到某个 id（序号或 UUID）对应的记录 key。 */
    keyOf(ordinal, id) {
        if (ordinal !== undefined) {
            for (const [key, record] of this.runs.entries()) {
                if (record.ordinal === ordinal)
                    return key;
            }
            return undefined;
        }
        for (const [key, record] of this.runs.entries()) {
            if (record.id === id)
                return key;
        }
        return undefined;
    }
    /** 等所有排队中的写入落盘。 */
    async drain() {
        await this.chain;
    }
    /** 摘要失败的记录数，供 /runs 诊断。 */
    countSummaryFailures() {
        let count = 0;
        for (const [, record] of this.runs.entries())
            if (record.summaryError !== null)
                count++;
        return count;
    }
    /** 已删除的墓碑数。 */
    tombstoneCount() {
        return this.tombstones.size;
    }
    log(message) {
        this.logger?.warn?.(message);
    }
}
/** `r12` / `12` → 12；UUID 或其他形式 → undefined。 */
export function parseOrdinal(id) {
    const match = /^r?([1-9]\d*)$/u.exec(id.trim());
    if (match === null)
        return undefined;
    const value = Number(match[1]);
    return Number.isSafeInteger(value) ? value : undefined;
}
