import type { DomainFacilityLike, DomainLike } from "../dsh.ts";
import { type DreamControl, type DreamJob, type DreamSession } from "./domain.ts";
/** 写入串行化；索引只在启动时建一次，当前记录更新不扫描历史。 */
export declare class DreamStore {
    private readonly jobs;
    private readonly cursors;
    private readonly controls;
    private readonly sessions;
    private readonly ordered;
    private readonly bySession;
    private readonly retryable;
    private chain;
    static open(facility: DomainFacilityLike): Promise<DreamStore>;
    constructor(domain: DomainLike);
    private enqueue;
    private index;
    get(id: string): DreamJob | undefined;
    list(options?: {
        offset?: number;
        limit?: number;
        cwd?: string;
    }): {
        items: DreamJob[];
        hasMore: boolean;
    };
    all(): DreamJob[];
    retry(cwd: string): DreamJob | undefined;
    control(): DreamControl;
    cursor(cwd: string): number;
    roots(): DreamSession[];
    root(sessionId: string): string | undefined;
    rememberSession(sessionId: string, rootSessionId: string): Promise<void>;
    setControl(patch: Partial<DreamControl>): Promise<void>;
    put(job: DreamJob): Promise<DreamJob>;
    update(id: string, patch: Partial<DreamJob> | ((job: DreamJob) => DreamJob)): Promise<DreamJob>;
    /** completed 记录先落盘，再推进 cursor；启动恢复补齐两次写之间的窗口。 */
    advance(cwd: string, ordinal: number): Promise<void>;
    private cwdKey;
    drain(): Promise<void>;
}
