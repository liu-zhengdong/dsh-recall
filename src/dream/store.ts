import { createHash } from "node:crypto";
import type { DomainFacilityLike, DomainLike, KvTableLike } from "../dsh.ts";
import { dreamDomain, type DreamControl, type DreamCursor, type DreamJob, type DreamSession } from "./domain.ts";

/** 写入串行化；索引只在启动时建一次，当前记录更新不扫描历史。 */
export class DreamStore {
  private readonly jobs: KvTableLike<DreamJob>;
  private readonly cursors: KvTableLike<DreamCursor>;
  private readonly controls: KvTableLike<DreamControl>;
  private readonly sessions: KvTableLike<DreamSession>;
  private readonly ordered: string[];
  private readonly bySession = new Map<string, string>();
  private readonly retryable = new Map<string, string>();
  private chain: Promise<unknown> = Promise.resolve();

  static async open(facility: DomainFacilityLike): Promise<DreamStore> {
    return new DreamStore(await facility.open(dreamDomain) as DomainLike);
  }

  constructor(domain: DomainLike) {
    this.jobs = domain.table("jobs") as KvTableLike<DreamJob>;
    this.cursors = domain.table("cursors") as KvTableLike<DreamCursor>;
    this.controls = domain.table("control") as KvTableLike<DreamControl>;
    this.sessions = domain.table("sessions") as KvTableLike<DreamSession>;
    const records = [...this.jobs.entries()].map(([, value]) => value)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    this.ordered = records.map((record) => record.id);
    for (const record of [...records].reverse()) this.index(record);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.chain.then(operation, operation);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private index(job: DreamJob): void {
    this.bySession.set(job.sessionId, job.id);
    if (job.status === "completed") this.retryable.delete(job.cwd);
    else if (!["starting", "running"].includes(job.status)) this.retryable.set(job.cwd, job.id);
  }

  get(id: string): DreamJob | undefined {
    const job = this.jobs.get(id) ?? this.jobs.get(this.bySession.get(id) ?? "");
    return job && structuredClone(job);
  }

  list(options: { offset?: number; limit?: number; cwd?: string } = {}): { items: DreamJob[]; hasMore: boolean } {
    const offset = Math.max(0, Math.floor(options.offset ?? 0));
    const limit = Math.min(50, Math.max(1, Math.floor(options.limit ?? 20)));
    const items: DreamJob[] = [];
    let skipped = 0;
    for (const id of this.ordered) {
      const job = this.jobs.get(id);
      if (!job || (options.cwd !== undefined && job.cwd !== options.cwd)) continue;
      if (skipped++ < offset) continue;
      if (items.length === limit) return { items, hasMore: true };
      items.push(structuredClone(job));
    }
    return { items, hasMore: false };
  }

  all(): DreamJob[] { return this.ordered.flatMap((id) => this.get(id) ?? []); }
  retry(cwd: string): DreamJob | undefined { return this.get(this.retryable.get(cwd) ?? ""); }
  control(): DreamControl { return this.controls.get("global") ?? { paused: false, lastAttempt: null }; }
  cursor(cwd: string): number { return this.cursors.get(this.cwdKey(cwd))?.cursor ?? 0; }
  roots(): DreamSession[] { return [...this.sessions.entries()].map(([, value]) => value); }
  root(sessionId: string): string | undefined { return this.sessions.get(sessionId)?.rootSessionId; }

  rememberSession(sessionId: string, rootSessionId: string): Promise<void> {
    if (this.root(sessionId) === rootSessionId) return Promise.resolve();
    return this.enqueue(() => this.sessions.put(sessionId, { sessionId, rootSessionId }));
  }

  setControl(patch: Partial<DreamControl>): Promise<void> {
    return this.enqueue(() => this.controls.put("global", { ...this.control(), ...patch }));
  }

  put(job: DreamJob): Promise<DreamJob> {
    return this.enqueue(async () => {
      const existing = this.jobs.get(job.id);
      await this.jobs.put(job.id, job);
      if (!existing) this.ordered.unshift(job.id);
      this.index(job);
      return structuredClone(job);
    });
  }

  update(id: string, patch: Partial<DreamJob> | ((job: DreamJob) => DreamJob)): Promise<DreamJob> {
    return this.enqueue(async () => {
      const existing = this.jobs.get(id);
      if (!existing) throw new Error(`没有复盘 ${id}`);
      const next = typeof patch === "function" ? patch(structuredClone(existing)) : { ...existing, ...patch };
      await this.jobs.put(id, next);
      this.index(next);
      return structuredClone(next);
    });
  }

  /** completed 记录先落盘，再推进 cursor；启动恢复补齐两次写之间的窗口。 */
  advance(cwd: string, ordinal: number): Promise<void> {
    return this.enqueue(async () => {
      if (ordinal > this.cursor(cwd)) await this.cursors.put(this.cwdKey(cwd), { cwd, cursor: ordinal });
    });
  }

  private cwdKey(cwd: string): string { return createHash("sha256").update(cwd).digest("hex"); }
  async drain(): Promise<void> { await this.chain; }
}
