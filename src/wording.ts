/**
 * 文案的唯一来源。
 *
 * 同一状态在工具结果、命令输出、卡片三处都出现；措辞漂移过一次
 * （「尚有历史未搜索」与「仍有历史未搜索」），所以集中在这里。
 */
import type { MessageLike } from "./dsh.ts";

export const NO_MATCH = "没有匹配的 Run。";
export const PAGE_MISSED = "本页未命中，尚有历史未搜索。";
export const NO_MESSAGES = "尚无已保存的消息。";

/** 截断到 maximum 个字符；不切开代理对，截断处加省略标记。 */
export function preview(text: string, maximum: number): string {
  let end = Math.min(text.length, maximum);
  if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1] ?? "")) end--;
  return text.slice(0, end) + (end < text.length ? "… [省略]" : "");
}

/** 去掉终端控制序列与控制字符，只留换行与制表。 */
export function clean(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/gu, "")
    .replace(/\p{Cc}/gu, (character) =>
      character === "\n" || character === "\t" ? character : "",
    );
}

/** 摘要缺失时的回退行。 */
export function overviewLine(
  overview: string | null,
  goal: string,
  limit = 200,
): string {
  return overview ?? `摘要未生成 · ${preview(goal || "无用户文本", limit)}`;
}

/** 一条消息的角色标签。 */
export function roleLabel(message: MessageLike): string {
  return typeof message.role === "string" ? message.role : "unknown";
}
