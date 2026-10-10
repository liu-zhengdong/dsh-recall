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

export const DOMAIN_NAME = "run_archive";
export const DOMAIN_VERSION = 1;
export const RUNS_TABLE = "runs";
export const TOMBSTONES_TABLE = "tombstones";

export const RUN_STATUSES = ["completed", "failed", "interrupted"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const runRecordSchema = z.object({
  /** 稳定 UUID；工具里也接受 rN 形式的序号。 */
  id: z.string(),
  sessionId: z.string(),
  /** 全局递增序号，构成 rN。 */
  ordinal: z.number().int().positive(),
  turn: z.number().int().nonnegative(),
  cwd: z.string(),
  agentId: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  status: z.enum(RUN_STATUSES),
  /** turn/end 的失败原因；成功为空串。 */
  error: z.string(),
  /** 首条用户文本，摘要缺失时作为回退目标。 */
  goal: z.string(),
  overview: z.string().nullable(),
  summaryError: z.string().nullable(),
});

export type RunRecord = z.infer<typeof runRecordSchema>;

/** 删除后留下的最小墓碑：证明这次删除是用户要求的，而不是记录损坏。 */
export const tombstoneSchema = z.object({
  id: z.string(),
  ordinal: z.number().int().positive(),
  deletedAt: z.string(),
  reason: z.string(),
});

export type TombstoneRecord = z.infer<typeof tombstoneSchema>;

/** 记录 key；同一个 turn 重复归档落回同一个文件。 */
export function runKey(sessionId: string, turn: number): string {
  return `${sessionId}__${turn}`;
}

export const runArchiveDomain = {
  name: DOMAIN_NAME,
  version: DOMAIN_VERSION,
  layout: "per-record" as const,
  tables: {
    [RUNS_TABLE]: { valueSchema: runRecordSchema },
    [TOMBSTONES_TABLE]: { valueSchema: tombstoneSchema },
  },
};
