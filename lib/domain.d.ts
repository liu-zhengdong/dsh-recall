/**
 * Run 归档的存储域声明。
 *
 * 只存「摘要 + 边界」，正文不落本域：正文由 `ctx.sessionQuery.readSession()`
 * 回读宿主自己的会话日志，同一份对话不存两遍。
 *
 * 布局选 `per-record`：一条 Run 一个文件，写入只碰自己那一个文档，
 * 删除也只删自己；`single` 布局会在每次 turn 结束时重写整份归档。
 *
 * 记录 key 是 `${sessionId}__${turn}`：同一个 turn 重复归档是幂等的，
 * 且字符集落在 per-record 后端的 `SAFE_KEY_RE` 内。
 */
import { z } from "zod";
export declare const DOMAIN_NAME = "run_archive";
export declare const DOMAIN_VERSION = 1;
export declare const RUNS_TABLE = "runs";
export declare const TOMBSTONES_TABLE = "tombstones";
export declare const RUN_STATUSES: readonly ["completed", "failed", "interrupted"];
export type RunStatus = (typeof RUN_STATUSES)[number];
export declare const runRecordSchema: z.ZodObject<{
    id: z.ZodString;
    sessionId: z.ZodString;
    ordinal: z.ZodNumber;
    turn: z.ZodNumber;
    cwd: z.ZodString;
    agentId: z.ZodString;
    startedAt: z.ZodString;
    endedAt: z.ZodString;
    status: z.ZodEnum<{
        completed: "completed";
        failed: "failed";
        interrupted: "interrupted";
    }>;
    error: z.ZodString;
    goal: z.ZodString;
    overview: z.ZodNullable<z.ZodString>;
    summaryError: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type RunRecord = z.infer<typeof runRecordSchema>;
/** 删除后留下的最小墓碑：证明这次删除是用户要求的，而不是记录损坏。 */
export declare const tombstoneSchema: z.ZodObject<{
    id: z.ZodString;
    ordinal: z.ZodNumber;
    deletedAt: z.ZodString;
    reason: z.ZodString;
}, z.core.$strip>;
export type TombstoneRecord = z.infer<typeof tombstoneSchema>;
/** 记录 key；同一个 turn 重复归档落回同一个文件。 */
export declare function runKey(sessionId: string, turn: number): string;
export declare const runArchiveDomain: {
    name: string;
    version: number;
    layout: "per-record";
    tables: {
        runs: {
            valueSchema: z.ZodObject<{
                id: z.ZodString;
                sessionId: z.ZodString;
                ordinal: z.ZodNumber;
                turn: z.ZodNumber;
                cwd: z.ZodString;
                agentId: z.ZodString;
                startedAt: z.ZodString;
                endedAt: z.ZodString;
                status: z.ZodEnum<{
                    completed: "completed";
                    failed: "failed";
                    interrupted: "interrupted";
                }>;
                error: z.ZodString;
                goal: z.ZodString;
                overview: z.ZodNullable<z.ZodString>;
                summaryError: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
        };
        tombstones: {
            valueSchema: z.ZodObject<{
                id: z.ZodString;
                ordinal: z.ZodNumber;
                deletedAt: z.ZodString;
                reason: z.ZodString;
            }, z.core.$strip>;
        };
    };
};
