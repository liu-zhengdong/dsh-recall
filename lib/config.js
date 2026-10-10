import Schema from "@deepseek-ai/schemastery";
/**
 * 配置住在 profile 的 cordis.patch.yml 里，由宿主设置服务物化。
 * 每个字段标 `.volatile()`，桌面端「设置 → 插件」页因此能直接改这些值。
 * 代价是运行时读到的可能是 volatile 引用而不是普通值，所以一律经过 `liveValue()`。
 */
export const DEFAULT_OVERVIEW_LIMIT = 200;
export const MAX_OVERVIEW_LIMIT = 2000;
export const Config = Schema.object({
    overviewLimit: Schema.number()
        .default(DEFAULT_OVERVIEW_LIMIT)
        .min(1)
        .max(MAX_OVERVIEW_LIMIT)
        .description("每条 Run 摘要的目标 Unicode 字符数")
        .volatile(),
    noSummary: Schema.boolean()
        .default(false)
        .description("只记录 Run 与消息，不调用模型生成摘要")
        .volatile(),
    summaryProvider: Schema.string()
        .default("")
        .description("摘要用的模型提供方；留空表示沿用当前会话的模型")
        .volatile(),
    summaryModel: Schema.string()
        .default("")
        .description("摘要用的模型名；留空表示沿用当前会话的模型")
        .volatile(),
});
export function liveValue(field) {
    if (typeof field === "object" &&
        field !== null &&
        typeof field.get === "function") {
        return field.get();
    }
    return field;
}
/** 归一化配置；非法值回落到默认，插件不因为一处配置写错就不加载。 */
export function normalizeConfig(config) {
    const limit = liveValue(config.overviewLimit);
    const provider = liveValue(config.summaryProvider);
    const model = liveValue(config.summaryModel);
    return {
        overviewLimit: typeof limit === "number" &&
            Number.isSafeInteger(limit) &&
            limit >= 1 &&
            limit <= MAX_OVERVIEW_LIMIT
            ? limit
            : DEFAULT_OVERVIEW_LIMIT,
        noSummary: liveValue(config.noSummary) === true,
        summaryProvider: typeof provider === "string" ? provider.trim() : "",
        summaryModel: typeof model === "string" ? model.trim() : "",
    };
}
