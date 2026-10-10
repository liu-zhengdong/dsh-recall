/**
 * 三个模型工具：recall / recall_message / forget。
 *
 * `parameters` 必须是**已编译好的 JSON Schema**，不是宿主 dsh-tools 的作者 DSL：
 * `ctx.tools.register` 只校验 `output.schema`（dsh-tools/lib/index.js:2882），
 * 运行时的 `schemaOf`（:3040）把 `parameters` 原样投影给模型。作者 DSL 的编译
 * 只发生在 `defineTool`（:838）内部 —— 本插件不 import 它，所以这里直接写
 * JSON Schema，`required` 是根上的字符串数组。
 *
 * 同理，宿主不会替我们校验模型传来的参数（`validateJsonSchemaValue` 只在
 * `defineTool` 的闭包里、以及输出值上被调用），因此 `execute` 入口自己解析。
 */
import type { ToolDefinitionLike } from "./dsh.ts";
import { type Archive } from "./find.ts";
export declare function createRecallTool(archive: () => Archive): ToolDefinitionLike;
export declare function createRecallMessageTool(archive: () => Archive): ToolDefinitionLike;
export declare function createForgetTool(store: () => {
    remove(ids: readonly string[], reason: string): Promise<unknown>;
}): ToolDefinitionLike;
/** 清理工具卡片里的终端转义，避免污染界面。 */
export declare function cleanTitle(value: string): string;
