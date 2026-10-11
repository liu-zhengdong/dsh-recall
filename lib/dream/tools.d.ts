import type { ToolDefinitionLike } from "../dsh.ts";
import type { DreamEngine } from "./engine.ts";
/** 全局注册三个工具。修改操作在真正执行时只承认 Dream 根 session 身份。 */
export declare function createDreamTools(need: () => DreamEngine): ToolDefinitionLike[];
