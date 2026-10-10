/**
 * 宿主半的 Remote 桥：把 RunStore 与 Archive 的读取面暴露给 Web 客户端。
 *
 * 插件解析不到 asar 内部的 @deepseek-ai/dsh-typert-protocol，所以手工复刻
 * Gateway 发现一个 Remote 命名空间所需的两件事：
 * - 实例上挂 `typertRemote` 绑定（service / serviceKey / namespace）；
 * - 原型上挂 REMOTE_METHOD_DESCRIPTOR 标记（version:1 的方法清单）。
 * Gateway 的 SRC fallback 会用 `Function.prototype.toString` 解析参数名，
 * 因此方法必须是普通类方法、参数是简单标识符；末位参数名为 `signal`
 * 即取消信号。返回值必须是无损 JSON。
 */
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";

const NAMESPACE = "recall";
const SERVICE_KEY = "dsh-recall/remote";

/** Archive / RunStore 尚未就绪时的统一错误文案。 */
const NOT_READY = "Run 归档尚未就绪";

type Runtime = {
  store: {
    list(): unknown[];
    remove(ids: string[], reason: string): Promise<unknown>;
  };
  archive: {
    find(args: unknown, signal?: AbortSignal): Promise<unknown>;
    detail(args: unknown): Promise<unknown>;
  };
};

function markRemote(
  prototype: object,
  entries: { method: string }[],
): void {
  const methods = entries.map((entry) =>
    Object.freeze({
      method: entry.method,
      invocation: Object.freeze({ kind: "direct" }),
    }),
  );
  Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      methods: Object.freeze(methods),
    }),
  });
}

/** 手写 JSON 化：宿主没有 schemastery，Gateway 只做无损 JSON 校验。 */
function structured(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null)) as unknown;
}

export class RecallRemoteService {
  private readonly ctx: { logger?: { warn?(format: unknown, ...param: unknown[]): void } };
  private readonly runtime: () => Runtime | undefined;
  private readonly failure: () => string | undefined;

  constructor(
    ctx: RecallRemoteService["ctx"],
    runtime: () => Runtime | undefined,
    failure: () => string | undefined,
  ) {
    this.ctx = ctx;
    this.runtime = runtime;
    this.failure = failure;
    this.typertRemote = Object.freeze({
      service: this,
      serviceKey: SERVICE_KEY,
      namespace: NAMESPACE,
    });
  }

  /** Gateway 的发现绑定；见文件头。 */
  readonly typertRemote: {
    service: RecallRemoteService;
    serviceKey: string;
    namespace: string;
  };

  /** 全部 Run（不含正文），供列表页一次拉全。 */
  runs() {
    const value = this.runtime();
    if (value === undefined) throw new Error(this.failure() ?? NOT_READY);
    return structured(value.store.list());
  }

  /** 搜索：query 空则列概览；分页参数原样透传给 Archive.find。 */
  search(args: unknown, signal?: AbortSignal) {
    const value = this.runtime();
    if (value === undefined)
      return Promise.reject(new Error(this.failure() ?? NOT_READY));
    return value.archive
      .find((args ?? {}) as never, signal)
      .then((result) => structured(result));
  }

  /** 读一条 Run 或一条消息的全文；按 Archive.detail 的 12KB 分页返回。 */
  detail(args: unknown) {
    const value = this.runtime();
    if (value === undefined)
      return Promise.reject(new Error(this.failure() ?? NOT_READY));
    return value.archive
      .detail((args ?? {}) as never)
      .then((result) => structured(result));
  }

  /** 删除；store.remove 整批校验，任一未知 ID 则整批拒绝。 */
  forget(ids: unknown, reason: unknown) {
    const value = this.runtime();
    if (value === undefined)
      return Promise.reject(new Error(this.failure() ?? NOT_READY));
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
      throw new Error("ids 必须是字符串数组");
    return value.store
      .remove(
        ids as string[],
        typeof reason === "string" && reason !== "" ? reason : "设置页手动删除",
      )
      .then((result) => structured(result));
  }
}

markRemote(RecallRemoteService.prototype, [
  { method: "runs" },
  { method: "search" },
  { method: "detail" },
  { method: "forget" },
]);

/**
 * 注册 Remote 命名空间。
 *
 * Gateway 通过 `ctx.provide` 的服务发现读到 typertRemote 绑定；
 * 客户端半边按同一个 NAMESPACE 生成 `remote.<NAMESPACE>` 的调用入口。
 */
export function installRemote(
  ctx: {
    provide(key: string, value: unknown): unknown;
    logger?: { warn?(format: unknown, ...param: unknown[]): void };
  },
  runtime: () => Runtime | undefined,
  failure: () => string | undefined,
): void {
  ctx.provide(SERVICE_KEY, new RecallRemoteService(ctx, runtime, failure));
  ctx.logger?.warn?.("Remote 命名空间 %s 已挂载（runs/search/detail/forget）", NAMESPACE);
}
