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
import type { DreamEngine } from "./dream/engine.ts";
type Runtime = {
    dream: DreamEngine;
    store: {
        list(): unknown[];
        remove(ids: string[], reason: string): Promise<unknown>;
    };
    archive: {
        find(args: unknown, signal?: AbortSignal): Promise<unknown>;
        detail(args: unknown): Promise<unknown>;
    };
};
export declare class RecallRemoteService {
    private readonly ctx;
    private readonly runtime;
    private readonly failure;
    constructor(ctx: RecallRemoteService["ctx"], runtime: () => Runtime | undefined, failure: () => string | undefined);
    /** Gateway 的发现绑定；见文件头。 */
    readonly typertRemote: {
        service: RecallRemoteService;
        serviceKey: string;
        namespace: string;
    };
    private needDream;
    dreamStatus(): unknown;
    dreams(args: unknown): unknown;
    dreamDetail(id: unknown): unknown;
    dreamRun(): Promise<unknown>;
    dreamStop(): Promise<unknown>;
    dreamPause(paused: unknown): Promise<unknown>;
    dreamRetry(id: unknown): Promise<unknown>;
    /** 单个脏位合并变化，慢客户端不会堆积历史快照；传输取消同时释放订阅。 */
    dreamWatch(signal: AbortSignal): AsyncGenerator<{
        changed: boolean;
    }, void, unknown>;
    /** 全部 Run（不含正文），供列表页一次拉全。 */
    runs(): unknown;
    /** 搜索：query 空则列概览；分页参数原样透传给 Archive.find。 */
    search(args: unknown, signal?: AbortSignal): Promise<unknown>;
    /** 读一条 Run 或一条消息的全文；按 Archive.detail 的 12KB 分页返回。 */
    detail(args: unknown): Promise<unknown>;
    /** 删除；store.remove 整批校验，任一未知 ID 则整批拒绝。 */
    forget(ids: unknown, reason: unknown): Promise<unknown>;
}
/**
 * 注册 Remote 命名空间。
 *
 * Gateway 通过 `ctx.provide` 的服务发现读到 typertRemote 绑定；
 * 客户端半边按同一个 NAMESPACE 生成 `remote.<NAMESPACE>` 的调用入口。
 */
export declare function installRemote(ctx: {
    provide(key: string, value: unknown): unknown;
    logger?: {
        warn?(format: unknown, ...param: unknown[]): void;
    };
}, runtime: () => Runtime | undefined, failure: () => string | undefined): void;
export {};
