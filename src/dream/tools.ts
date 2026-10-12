import { z } from "zod";
import type { ToolDefinitionLike, ToolRunContextLike } from "../dsh.ts";
import { dreamSubmissionSchema } from "./domain.ts";
import type { DreamEngine } from "./engine.ts";

const historySchema = z.object({
  id: z.string().optional(), cwd: z.string().optional(),
  offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(20).default(10),
}).strict();
const sourceItems = { type: "array", items: { type: "string" }, minItems: 1, maxItems: 30 };
const conclusionProperties = {
  text: { type: "string", minLength: 1, maxLength: 4000 },
  kind: { type: "string", enum: ["fact", "inference", "unverified"] }, sources: sourceItems,
};
function sessionId(exec: ToolRunContextLike): string {
  const id = exec.agent?.session?.id ?? exec.agent?.session?.header?.id;
  if (!id) throw new Error("无法识别调用工具的会话");
  return id;
}
function definition(name: string, description: string, parameters: Record<string, unknown>, execute: (args: unknown, exec: ToolRunContextLike) => Promise<unknown>): ToolDefinitionLike {
  return {
    name, description, parameters,
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
    execute,
  };
}

/** 全局注册两个工具。提交只承认 Dream 根 session 身份。 */
export function createDreamTools(need: () => DreamEngine): ToolDefinitionLike[] {
  return [
    definition("dream", "查询已保存的审计报告与来源。复盘是历史证据，不代表原任务成功。传 id 查看一条，否则分页列出。", {
      type: "object", properties: {
        id: { type: "string" }, cwd: { type: "string" }, offset: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      }, additionalProperties: false,
    }, async (args) => {
      const input = historySchema.parse(args);
      const engine = need();
      if (input.id) {
        const job = engine.store.get(input.id);
        if (!job) throw new Error(`没有复盘 ${input.id}`);
        return job;
      }
      const result = engine.list(input);
      return { ...result, items: result.items.map((job) => ({
        id: job.id, sessionId: job.sessionId, cwd: job.cwd, title: job.title, status: job.status,
        startedAt: job.startedAt, endedAt: job.endedAt, conclusions: job.conclusions,
        noChangeReason: job.noChangeReason, error: job.error,
        sources: job.batch.map((run) => `r${run.ordinal}`),
      })) };
    }),
    definition("dream_complete", "在独立复盘会话中提交审计报告。每条必须引用本批 rN 或实际存在的 rN/mN；正常结束当前回合才完成。已完成会话可再次提交人工修正。", {
      type: "object", properties: {
        conclusions: { type: "array", maxItems: 20, items: { type: "object", properties: conclusionProperties,
          required: ["text", "kind", "sources"], additionalProperties: false } },
        noChangeReason: { type: "string", maxLength: 4000 },
      }, required: ["conclusions"], additionalProperties: false,
    }, async (args, exec) => {
      const input = dreamSubmissionSchema.parse(args);
      const engine = need();
      const job = await engine.track(() => engine.complete(sessionId(exec), input, exec.signal));
      return { id: job.id, submitted: true, correction: job.status === "completed", conclusionCount: input.conclusions.length,
        note: "结果已提交；当前回合正常结束后生效" };
    }),
  ];
}
