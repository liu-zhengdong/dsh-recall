/**
 * 文案的唯一来源。
 *
 * 同一状态在工具结果、命令输出、卡片三处都出现；措辞漂移过一次
 * （「尚有历史未搜索」与「仍有历史未搜索」），所以集中在这里。
 */
import type { MessageLike } from "./dsh.ts";
export declare const NO_MATCH = "\u6CA1\u6709\u5339\u914D\u7684 Run\u3002";
export declare const PAGE_MISSED = "\u672C\u9875\u672A\u547D\u4E2D\uFF0C\u5C1A\u6709\u5386\u53F2\u672A\u641C\u7D22\u3002";
export declare const NO_MESSAGES = "\u5C1A\u65E0\u5DF2\u4FDD\u5B58\u7684\u6D88\u606F\u3002";
export declare const READ_DONE = "[\u5DF2\u8BFB\u5B8C]";
/** 分页正文末行的续页调用；模型照抄即可拿到合法游标。 */
export declare function continuationLine(tool: "recall" | "recall_message", args: Record<string, unknown>): string;
/** 截断到 maximum 个字符；不切开代理对，截断处加省略标记。 */
export declare function preview(text: string, maximum: number): string;
/** 去掉终端控制序列与控制字符，只留换行与制表。 */
export declare function clean(value: string): string;
/** 摘要缺失时的回退行。 */
export declare function overviewLine(overview: string | null, goal: string, limit?: number): string;
/**
 * 启动注入的开头。Run 是过去发生过什么的存档，不是当前指令，
 * 也不证明当时的任务成功。
 */
export declare function startupRecallLead(count: number, scope: "cwd" | "all"): string;
/** 一条消息的角色标签。 */
export declare function roleLabel(message: MessageLike): string;
