import Schema from "@deepseek-ai/schemastery";

/**
 * 配置住在 profile 的 cordis.patch.yml 里，由宿主设置服务物化。
 * 每个字段标 `.volatile()`，桌面端「设置 → 插件」页因此能直接改这些值。
 * 代价是运行时读到的可能是 volatile 引用而不是普通值，所以一律经过 `liveValue()`。
 */
export const DEFAULT_OVERVIEW_LIMIT = 200;
export const MAX_OVERVIEW_LIMIT = 2000;
export const DEFAULT_STARTUP_RECALL_COUNT = 10;
export const MAX_STARTUP_RECALL_COUNT = 100;

export type StartupRecallScope = "cwd" | "all";

export interface PluginConfig {
  overviewLimit: number;
  noSummary: boolean;
  summaryProvider: string;
  summaryModel: string;
  autoDream: boolean;
  dreamThreshold: number;
  dreamProvider: string;
  dreamModel: string;
  /** 新会话开始时是否把最近 Run 的索引注入主 Agent。默认开。 */
  startupRecall: boolean;
  /** 注入条数。默认 10。 */
  startupRecallCount: number;
  /** `cwd` 只含当前目录；`all` 含全部目录。默认 `cwd`。 */
  startupRecallScope: StartupRecallScope;
}

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
  autoDream: Schema.boolean().default(true).description("自动复盘积累的执行记录").volatile(),
  dreamThreshold: Schema.number().default(30).min(1).max(1000)
    .description("同一工作目录积累多少条未整理记录后自动复盘").volatile(),
  dreamProvider: Schema.string().default("").description("复盘模型提供方；与模型同时留空使用宿主默认路由").volatile(),
  dreamModel: Schema.string().default("").description("复盘模型名；需与提供方同时填写").volatile(),
  startupRecall: Schema.boolean()
    .default(true)
    .description("新会话开始时，把最近 Run 的索引注入主 Agent；续接、清空、压缩不重复注入")
    .volatile(),
  startupRecallCount: Schema.number()
    .default(DEFAULT_STARTUP_RECALL_COUNT)
    .min(1)
    .max(MAX_STARTUP_RECALL_COUNT)
    .description("启动时注入的 Run 条数")
    .volatile(),
  startupRecallScope: Schema.union([Schema.const("cwd"), Schema.const("all")])
    .default("cwd")
    .description("启动注入的范围：cwd 只含当前工作目录，all 含全部目录")
    .volatile(),
});

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
export function liveValue<T>(field: T | VolatileField<T>): T;
export function liveValue<T>(
  field: T | VolatileField<T> | undefined,
): T | undefined;
export function liveValue<T>(
  field: T | VolatileField<T> | undefined,
): T | undefined {
  if (
    typeof field === "object" &&
    field !== null &&
    typeof (field as VolatileField<T>).get === "function"
  ) {
    return (field as VolatileField<T>).get();
  }
  return field as T | undefined;
}

/** 归一化配置；非法值回落到默认，插件不因为一处配置写错就不加载。 */
export function normalizeConfig(config: Partial<PluginConfig>): PluginConfig {
  const limit = liveValue(config.overviewLimit);
  const provider = liveValue(config.summaryProvider);
  const model = liveValue(config.summaryModel);
  return {
    overviewLimit:
      typeof limit === "number" &&
      Number.isSafeInteger(limit) &&
      limit >= 1 &&
      limit <= MAX_OVERVIEW_LIMIT
        ? limit
        : DEFAULT_OVERVIEW_LIMIT,
    noSummary: liveValue(config.noSummary) === true,
    summaryProvider: typeof provider === "string" ? provider.trim() : "",
    summaryModel: typeof model === "string" ? model.trim() : "",
    autoDream: liveValue(config.autoDream) !== false,
    dreamThreshold: Number.isSafeInteger(liveValue(config.dreamThreshold)) &&
      (liveValue(config.dreamThreshold) ?? 0) >= 1 && (liveValue(config.dreamThreshold) ?? 0) <= 1000
      ? liveValue(config.dreamThreshold)! : 30,
    dreamProvider: stringValue(config.dreamProvider),
    dreamModel: stringValue(config.dreamModel),
    startupRecall: liveValue(config.startupRecall) !== false,
    startupRecallCount: countValue(config.startupRecallCount),
    startupRecallScope: scopeValue(config.startupRecallScope),
  };
}

function countValue(field: number | undefined): number {
  const value = liveValue(field);
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAX_STARTUP_RECALL_COUNT
    ? value
    : DEFAULT_STARTUP_RECALL_COUNT;
}

/** 只认 `all`；缺省、空串和其他写法都回到当前目录。 */
function scopeValue(field: StartupRecallScope | undefined): StartupRecallScope {
  const value = liveValue(field);
  return typeof value === "string" && value.trim() === "all" ? "all" : "cwd";
}

function stringValue(field: string | undefined): string {
  const value = liveValue(field);
  return typeof value === "string" ? value.trim() : "";
}
