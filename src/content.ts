/**
 * 把 DSH 的消息与内容块投影成可读文本。
 *
 * 两条投影刻意分开：
 * - `messageText` 给人和模型读全文（含思考、工具参数）。
 * - `searchText` 只给关键词检索用，只取可读正文，**不含思考与工具参数**；
 *   私密推理不是已验证的执行证据，把它纳入检索只会让命中率失真。
 */
import type { ContentBlockLike, MessageLike } from "./dsh.ts";

export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 归一化内容块；字符串正文视作单个 text 块。 */
export function blocks(message: MessageLike): ContentBlockLike[] {
  const content = message.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [];
  return content.filter(
    (block): block is ContentBlockLike =>
      block !== null && typeof block === "object",
  );
}

function prettyArguments(raw: unknown): string {
  if (typeof raw !== "string") return JSON.stringify(raw, null, 2) ?? "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2) ?? raw;
  } catch {
    return raw;
  }
}

function blockKind(block: ContentBlockLike): string {
  return typeof block.type === "string" ? block.type : "附件";
}

/** 检索用文本：只有可读正文，不含思考与工具参数。 */
export function searchText(message: MessageLike): string {
  return blocks(message)
    .filter((block) => block.type === "text")
    .map((block) => (typeof block.text === "string" ? block.text : ""))
    .join("\n")
    .trim();
}

/** 折叠行预览：不展开正文，只给定位信息。 */
export function messagePreview(
  message: MessageLike,
  toolName: string | undefined,
): string {
  if (message.role === "tool") {
    const state = message.isError === true ? "错误" : "已返回";
    return `工具结果 ${toolName ?? ""} · ${state}（按消息 ID 展开）`;
  }
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "[非文本消息，按 ID 展开]";
  const parts = blocks(message).map((block) => {
    switch (block.type) {
      case "text":
        return typeof block.text === "string" ? block.text : "";
      case "reasoning":
        return "[含思考内容，按 ID 展开]";
      case "tool-call":
        return `调用 ${block.name ?? ""} ${prettyArguments(block.arguments)}`;
      default:
        return `[${blockKind(block)}，原始数据通过 format=raw 读取]`;
    }
  });
  const joined = parts.filter(Boolean).join("\n");
  return joined === "" ? "[无正文，按 ID 展开]" : joined;
}

/** 全文投影：按顺序拼接各块，供 recall_message 使用。 */
export function messageText(
  message: MessageLike,
  toolName: string | undefined,
): string {
  if (typeof message.content === "string") return message.content;
  const parts = blocks(message).map((block) => {
    switch (block.type) {
      case "text":
        return typeof block.text === "string" ? block.text : "";
      case "reasoning":
        return `思考\n${typeof block.text === "string" ? block.text : ""}`;
      case "tool-call":
        return `工具调用 ${block.name ?? ""} (${block.id ?? ""})\n${prettyArguments(block.arguments)}`;
      default:
        return `[${blockKind(block)}；编码内容通过 format=raw 读取]`;
    }
  });
  const body = parts.filter(Boolean).join("\n\n");
  if (message.role === "tool") {
    const state = message.isError === true ? "错误" : "已返回";
    const head = `工具结果 ${toolName ?? ""} (${message.toolCallId ?? ""}) · ${state}\n`;
    return body === "" ? head : head + body;
  }
  return body;
}
