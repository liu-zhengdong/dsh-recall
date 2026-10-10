import { Config, type PluginConfig } from "./config.ts";
import type { PluginContextLike } from "./dsh.ts";
export declare const name = "dsh-recall";
/** 归档域与正文回读是硬依赖；其余服务缺失时降级而不是不加载。 */
export declare const inject: string[];
export { Config };
export type { PluginConfig } from "./config.ts";
export declare function apply(ctx: PluginContextLike, config: Partial<PluginConfig>): void;
