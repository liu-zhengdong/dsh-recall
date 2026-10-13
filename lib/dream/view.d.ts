import type { DreamJob } from "./domain.ts";
import type { DreamStatus } from "./engine.ts";
/** 列表与通知只传概览；材料和实际文件差异由 dreamDetail 按需读取。 */
export declare function dreamSummary(job: DreamJob): {
    id: string;
    sessionId: string;
    cwd: string;
    title: string;
    status: "running" | "completed" | "failed" | "interrupted" | "starting" | "cancelled";
    startedAt: string;
    endedAt: string | null;
    error: string;
    batchCount: number;
    conclusionCount: number;
    preview: string;
    noChangeReason: string;
    correctionError: string;
};
export declare function dreamStatusView(status: DreamStatus): {
    running: {
        id: string;
        sessionId: string;
        cwd: string;
        title: string;
        status: "running" | "completed" | "failed" | "interrupted" | "starting" | "cancelled";
        startedAt: string;
        endedAt: string | null;
        error: string;
        batchCount: number;
        conclusionCount: number;
        preview: string;
        noChangeReason: string;
        correctionError: string;
    } | null;
    enabled: boolean;
    paused: boolean;
    threshold: number;
    pendingCount: number;
    cursor: number;
    lastAttempt: string | null;
    sessionIds: string[];
    error: string | null;
};
