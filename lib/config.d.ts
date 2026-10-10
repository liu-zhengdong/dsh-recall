import Schema from "@deepseek-ai/schemastery";
/**
 * 配置住在 profile 的 cordis.patch.yml 里，由宿主设置服务物化。
 * 每个字段标 `.volatile()`，桌面端「设置 → 插件」页因此能直接改这些值。
 * 代价是运行时读到的可能是 volatile 引用而不是普通值，所以一律经过 `liveValue()`。
 */
export declare const DEFAULT_OVERVIEW_LIMIT = 200;
export declare const MAX_OVERVIEW_LIMIT = 2000;
export interface PluginConfig {
    overviewLimit: number;
    noSummary: boolean;
    summaryProvider: string;
    summaryModel: string;
}
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    overviewLimit: Schema<number, number, "volatile-defined">;
    noSummary: Schema<boolean, boolean, "volatile-defined">;
    summaryProvider: Schema<string, string, "volatile-defined">;
    summaryModel: Schema<string, string, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    overviewLimit: Schema<number, number, "volatile-defined">;
    noSummary: Schema<boolean, boolean, "volatile-defined">;
    summaryProvider: Schema<string, string, "volatile-defined">;
    summaryModel: Schema<string, string, "volatile-defined">;
}>>, "plain">;
/** cosmokit 的 volatile 引用：schemastery `.volatile()` 字段的运行时形状。 */
export interface VolatileField<T> {
    get(): T;
}
/**
 * 读一个可能被 `.volatile()` 包裹的配置字段。
 *
 * 必须每次用到时现读：volatile 引用是对象，当作普通值用不会报错，
 * 只会静默拿到 `undefined`。
 */
export declare function liveValue<T>(field: T | VolatileField<T>): T;
export declare function liveValue<T>(field: T | VolatileField<T> | undefined): T | undefined;
/** 归一化配置；非法值回落到默认，插件不因为一处配置写错就不加载。 */
export declare function normalizeConfig(config: Partial<PluginConfig>): PluginConfig;
