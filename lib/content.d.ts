/**
 * 把 DSH 的消息与内容块投影成可读文本。
 *
 * 两条投影刻意分开：
 * - `messageText` 给人和模型读全文（含思考、工具参数）。
 * - `searchText` 只给关键词检索用，只取可读正文，**不含思考与工具参数**；
 *   私密推理不是已验证的执行证据，把它纳入检索只会让命中率失真。
 */
import type { ContentBlockLike, MessageLike } from "./dsh.ts";
export declare function object(value: unknown): Record<string, unknown>;
/** 归一化内容块；字符串正文视作单个 text 块。 */
export declare function blocks(message: MessageLike): ContentBlockLike[];
/** 检索用文本：只有可读正文，不含思考与工具参数。 */
export declare function searchText(message: MessageLike): string;
/** 折叠行预览：不展开正文，只给定位信息。 */
export declare function messagePreview(message: MessageLike, toolName: string | undefined): string;
/** 全文投影：按顺序拼接各块，供 recall_message 使用。 */
export declare function messageText(message: MessageLike, toolName: string | undefined): string;
