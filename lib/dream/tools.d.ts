import type { ToolDefinitionLike } from "../dsh.ts";
import type { DreamEngine } from "./engine.ts";
/** 全局注册两个工具。提交只承认 Dream 根 session 身份。 */
export declare function createDreamTools(need: () => DreamEngine): ToolDefinitionLike[];
