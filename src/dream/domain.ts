import { z } from "zod";

export const DREAM_BATCH_SIZE = 30;
export const DREAM_MIN_INTERVAL_MS = 60 * 60 * 1000;
export const DREAM_TIMEOUT_MS = 10 * 60 * 1000;

const batchRunSchema = z.object({
  id: z.string(), ordinal: z.number().int().positive(), sessionId: z.string(),
  turn: z.number().int().nonnegative(), startedAt: z.string(), endedAt: z.string(),
  status: z.enum(["completed", "failed", "interrupted"]), goal: z.string(), overview: z.string().nullable(),
});
export type DreamBatchRun = z.infer<typeof batchRunSchema>;
export const dreamConclusionSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  kind: z.enum(["fact", "inference", "unverified"]),
  sources: z.array(z.string().regex(/^r[1-9]\d*(?:\/m[1-9]\d*)?$/u)).min(1).max(30),
}).strict();
export const dreamSubmissionSchema = z.object({
  conclusions: z.array(dreamConclusionSchema).max(20),
  noChangeReason: z.string().trim().max(4000).default(""),
}).strict().refine((value) => value.conclusions.length > 0 || value.noChangeReason.length > 0,
  "没有值得记的内容时必须说明原因");
export type DreamSubmission = z.infer<typeof dreamSubmissionSchema>;
export type DreamConclusion = z.infer<typeof dreamConclusionSchema>;
export const dreamJobSchema = z.object({
  id: z.string(), sessionId: z.string(), cwd: z.string(), title: z.string(),
  status: z.enum(["starting", "running", "completed", "failed", "cancelled", "interrupted"]),
  startedAt: z.string(), endedAt: z.string().nullable(), error: z.string(),
  batch: z.array(batchRunSchema).min(1).max(DREAM_BATCH_SIZE), retryOf: z.string().nullable(),
  conclusions: z.array(dreamConclusionSchema).max(20),
  noChangeReason: z.string(), submittedAt: z.string().nullable(),
  submittedTurn: z.number().int().nonnegative().nullable(),
  draft: z.object({ submission: dreamSubmissionSchema, turn: z.number().int().nonnegative(), at: z.string() }).nullable().default(null),
  correctionError: z.string().default(""),
});
export type DreamJob = z.infer<typeof dreamJobSchema>;
const cursorSchema = z.object({ cwd: z.string(), cursor: z.number().int().nonnegative() });
export type DreamCursor = z.infer<typeof cursorSchema>;
const controlSchema = z.object({ paused: z.boolean(), lastAttempt: z.string().nullable() });
export type DreamControl = z.infer<typeof controlSchema>;
const sessionSchema = z.object({ sessionId: z.string(), rootSessionId: z.string() });
export type DreamSession = z.infer<typeof sessionSchema>;

/** 独立域，不触碰已有 run_archive v1。 */
export const dreamDomain = {
  name: "dream", version: 1, layout: "per-record" as const,
  tables: {
    jobs: { valueSchema: dreamJobSchema }, cursors: { valueSchema: cursorSchema },
    control: { valueSchema: controlSchema }, sessions: { valueSchema: sessionSchema },
  },
};
