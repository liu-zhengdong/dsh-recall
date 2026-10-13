import { dreamDomain } from "./domain.js";
/** 全局单游标的固定键；旧版按目录哈希存的游标仅在迁移时读取。 */
const GLOBAL_CURSOR_KEY = "global";
/** 写入串行化；索引只在启动时建一次，当前记录更新不扫描历史。 */
export class DreamStore {
    jobs;
    cursors;
    controls;
    sessions;
    ordered;
    bySession = new Map();
    chain = Promise.resolve();
    static async open(facility) {
        return new DreamStore(await facility.open(dreamDomain));
    }
    constructor(domain) {
        this.jobs = domain.table("jobs");
        this.cursors = domain.table("cursors");
        this.controls = domain.table("control");
        this.sessions = domain.table("sessions");
        const records = [...this.jobs.entries()].map(([, value]) => value)
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        this.ordered = records.map((record) => record.id);
        for (const record of [...records].reverse())
            this.index(record);
    }
    enqueue(operation) {
        const next = this.chain.then(operation, operation);
        this.chain = next.catch(() => undefined);
        return next;
    }
    index(job) {
        this.bySession.set(job.sessionId, job.id);
    }
    get(id) {
        const job = this.jobs.get(id) ?? this.jobs.get(this.bySession.get(id) ?? "");
        return job && structuredClone(job);
    }
    list(options = {}) {
        const offset = Math.max(0, Math.floor(options.offset ?? 0));
        const limit = Math.min(50, Math.max(1, Math.floor(options.limit ?? 20)));
        const items = [];
        let skipped = 0;
        for (const id of this.ordered) {
            const job = this.jobs.get(id);
            if (!job || (options.cwd !== undefined && job.cwd !== options.cwd))
                continue;
            if (skipped++ < offset)
                continue;
            if (items.length === limit)
                return { items, hasMore: true };
            items.push(structuredClone(job));
        }
        return { items, hasMore: false };
    }
    all() { return this.ordered.flatMap((id) => this.get(id) ?? []); }
    control() { return this.controls.get("global") ?? { paused: false, lastAttempt: null }; }
    cursor() {
        const global = this.cursors.get(GLOBAL_CURSOR_KEY)?.cursor ?? 0;
        // 旧版按目录存游标（键为目录哈希）；迁移起点取各目录最大值，旧记录留在表里不再读。
        let best = global;
        for (const [, value] of this.cursors.entries()) {
            const legacy = value.cursor;
            if (typeof legacy === "number" && legacy > best)
                best = legacy;
        }
        return best;
    }
    roots() { return [...this.sessions.entries()].map(([, value]) => value); }
    root(sessionId) { return this.sessions.get(sessionId)?.rootSessionId; }
    rememberSession(sessionId, rootSessionId) {
        if (this.root(sessionId) === rootSessionId)
            return Promise.resolve();
        return this.enqueue(() => this.sessions.put(sessionId, { sessionId, rootSessionId }));
    }
    setControl(patch) {
        return this.enqueue(() => this.controls.put("global", { ...this.control(), ...patch }));
    }
    put(job) {
        return this.enqueue(async () => {
            const existing = this.jobs.get(job.id);
            await this.jobs.put(job.id, job);
            if (!existing)
                this.ordered.unshift(job.id);
            this.index(job);
            return structuredClone(job);
        });
    }
    update(id, patch) {
        return this.enqueue(async () => {
            const existing = this.jobs.get(id);
            if (!existing)
                throw new Error(`没有复盘 ${id}`);
            const next = typeof patch === "function" ? patch(structuredClone(existing)) : { ...existing, ...patch };
            await this.jobs.put(id, next);
            this.index(next);
            return structuredClone(next);
        });
    }
    /** completed 记录先落盘，再推进 cursor；启动恢复补齐两次写之间的窗口。 */
    advance(ordinal) {
        return this.enqueue(async () => {
            if (ordinal > this.cursor())
                await this.cursors.put(GLOBAL_CURSOR_KEY, { cursor: ordinal });
        });
    }
    async drain() { await this.chain; }
}
