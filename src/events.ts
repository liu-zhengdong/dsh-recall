/**
 * 把一条会话事件日志折算成「一个 turn 的消息序列」。
 *
 * DSH 的 turn/start 与 turn/end 成对出现，且 turn/end 即使出错也必发，
 * 所以 run 边界直接取这对事件，插件不需要自己维护配对状态。
 *
 * 消息只取三类，与模型可见的会话消息一一对应：
 * user/message、assistant/message、tool/result。
 * tool/call 不是独立消息——它已经是 assistant 消息里的一个内容块。
 */
import { object } from "./content.ts";
import type { MessageLike, SessionEventLike } from "./dsh.ts";

export type RunStatus = "running" | "completed" | "failed" | "interrupted";

export type RunMessage = {
  /** 1 起的位置序号，构成 rN/mK 里的 K。 */
  position: number;
  /** 会话日志内的 seq，用于回读正文。 */
  seq: number;
  role: "user" | "assistant" | "tool";
  /** 消息自身 id（MessageId）；legacy 全局 m 号与 UUID 靠它解析。 */
  id: string;
  /** tool 消息对应的工具名。 */
  toolName?: string;
  message: MessageLike;
};

export type RunBoundary = {
  turn: number;
  startSeq: number;
  endSeq: number;
  /** turn/start 的事件时间（Unix epoch ms）。 */
  startTime: number;
  /** turn/end 的事件时间（Unix epoch ms）。 */
  endTime: number;
  status: RunStatus;
  /** turn/end 的失败原因文本；成功为空。 */
  error: string;
  messages: RunMessage[];
  /** 首条用户文本，作为摘要缺失时的回退目标。 */
  goal: string;
};

function statusOf(reason: unknown): { status: RunStatus; error: string } {
  const kind = object(reason).kind;
  switch (kind) {
    case "completed":
      return { status: "completed", error: "" };
    case "aborted":
      return { status: "interrupted", error: "aborted" };
    case "blocked":
      return { status: "interrupted", error: "blocked" };
    case "max-tokens":
      return { status: "failed", error: "max-tokens" };
    case "error": {
      const failure = object(object(reason).error);
      const message =
        typeof failure.message === "string" ? failure.message : "error";
      const code = typeof failure.code === "string" ? ` (${failure.code})` : "";
      return { status: "failed", error: `${message}${code}` };
    }
    default:
      return { status: "completed", error: "" };
  }
}

/** 从消息内容里取第一段可读用户文本。 */
function firstUserText(message: MessageLike): string {
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string")
      return block.text.trim();
  }
  return "";
}

/**
 * 扫描整份事件日志，按 turn 切出每个 run 的消息与边界。
 * 只收完整的 turn（同时见到 turn/start 与 turn/end）。
 */
export function foldRuns(events: readonly SessionEventLike[]): RunBoundary[] {
  const runs: RunBoundary[] = [];
  let current: RunBoundary | undefined;
  const toolNames = new Map<string, string>();

  for (const event of events) {
    const seq = typeof event.seq === "number" ? event.seq : 0;
    const data = object(event.data);
    switch (event.type) {
      case "turn/start": {
        const turn = typeof data.turn === "number" ? data.turn : 0;
        current = {
          turn,
          startSeq: seq,
          endSeq: seq,
          startTime: typeof event.time === "number" ? event.time : 0,
          endTime: typeof event.time === "number" ? event.time : 0,
          status: "running",
          error: "",
          messages: [],
          goal: "",
        };
        break;
      }
      case "user/message": {
        if (!current) break;
        const message = data as MessageLike;
        if (current.goal === "") current.goal = firstUserText(message);
        current.messages.push({
          position: current.messages.length + 1,
          seq,
          role: "user",
          id: typeof message.id === "string" ? message.id : "",
          message,
        });
        break;
      }
      case "assistant/message": {
        if (!current) break;
        const message = object(data.message) as MessageLike;
        current.messages.push({
          position: current.messages.length + 1,
          seq,
          role: "assistant",
          id: typeof message.id === "string" ? message.id : "",
          message,
        });
        break;
      }
      case "tool/call": {
        const callId = typeof data.callId === "string" ? data.callId : "";
        const toolName = typeof data.name === "string" ? data.name : "";
        if (callId !== "") toolNames.set(callId, toolName);
        break;
      }
      case "tool/result": {
        if (!current) break;
        const message = object(data.message) as MessageLike;
        const callId =
          typeof message.toolCallId === "string" ? message.toolCallId : "";
        current.messages.push({
          position: current.messages.length + 1,
          seq,
          role: "tool",
          id: typeof message.id === "string" ? message.id : "",
          ...(toolNames.has(callId)
            ? { toolName: toolNames.get(callId) as string }
            : {}),
          message,
        });
        break;
      }
      case "turn/end": {
        if (!current) break;
        const turn = typeof data.turn === "number" ? data.turn : -1;
        if (turn !== current.turn) break;
        const outcome = statusOf(data.reason);
        current.endSeq = seq;
        current.endTime = typeof event.time === "number" ? event.time : current.endTime;
        current.status = outcome.status;
        current.error = outcome.error;
        runs.push(current);
        current = undefined;
        break;
      }
      default:
        break;
    }
  }
  return runs;
}
