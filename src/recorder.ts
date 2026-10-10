/**
 * 事件记录器：把会话事件流折算成 Run 归档。
 *
 * run 边界直接取 `turn/start` 与 `turn/end` 这一对（宿主保证成对且 turn/end 必发，
 * 出错也发），所以插件不维护自己的配对状态。
 *
 * 归档动作在 `turn/end` 触发：此时该 turn 的日志已经提交，回读正文必定完整。
 * 写入是异步的，调用方不等待；失败只记日志，不影响会话。
 */
import type {
  LoggerLike,
  PluginContextLike,
  SessionEventLike,
} from "./dsh.ts";
import type { RunBoundary } from "./events.ts";
import { preview } from "./wording.ts";
import type { RunRecord, RunSource, RunStore } from "./store.ts";

export type RecorderOptions = {
  store: RunStore;
  /** 回读某个会话的某个 turn；日志缺失时返回 undefined。 */
  loadBoundary: (
    sessionId: string,
    turn: number,
  ) => Promise<RunBoundary | undefined>;
  logger?: LoggerLike;
  /** 归档完成后回调（用于排队摘要）。 */
  onArchived?: (record: RunRecord, boundary: RunBoundary) => void;
};

export class RunRecorder {
  private readonly store: RunStore;
  private readonly loadBoundary: RecorderOptions["loadBoundary"];
  private readonly logger: LoggerLike | undefined;
  private readonly onArchived: RecorderOptions["onArchived"];
  private readonly controller = new AbortController();
  /** 归档任务的串行链：回读日志 + 落库都排在同一条链上。 */
  private chain: Promise<unknown> = Promise.resolve();
  private closed = false;
  private lastError: string | undefined;

  constructor(options: RecorderOptions) {
    this.store = options.store;
    this.loadBoundary = options.loadBoundary;
    this.logger = options.logger;
    this.onArchived = options.onArchived;
  }

  get error(): string | undefined {
    return this.lastError;
  }

  /**
   * 收一条会话事件。
   *
   * 只在 `turn/end` 上动手：turn/start 之后的正文可能还在写，
   * 而 turn/end 提交时该 turn 的事件已经齐全。
   */
  capture(
    session: { id?: string; header?: { cwd?: string } },
    event: SessionEventLike,
  ): void {
    if (this.closed) return;
    if (event.type !== "turn/end") return;
    const sessionId = typeof session.id === "string" ? session.id : "";
    if (sessionId === "") return;
    const turn = Number((event.data as { turn?: unknown } | undefined)?.turn);
    if (!Number.isSafeInteger(turn) || turn < 0) return;
    const cwd = session.header?.cwd ?? "";
    const task = () => this.archive(sessionId, turn, cwd);
    const next = this.chain.then(task, task);
    this.chain = next.catch(() => undefined);
  }

  /** 回读该会话日志，切出目标 turn 并归档。 */
  private async archive(
    sessionId: string,
    turn: number,
    cwd: string,
  ): Promise<void> {
    if (this.controller.signal.aborted) return;
    try {
      const boundary = await this.loadBoundary(sessionId, turn);
      if (boundary === undefined) return;
      const source: RunSource = { sessionId, cwd, agentId: sessionId };
      const record = await this.store.record(
        {
          turn: boundary.turn,
          startedAt: new Date(boundary.startTime).toISOString(),
          endedAt: new Date(boundary.endTime).toISOString(),
          status: boundary.status === "running" ? "interrupted" : boundary.status,
          error: boundary.error,
          goal: boundary.goal,
        },
        source,
      );
      this.onArchived?.(record, boundary);
      this.logger?.debug?.(
        "recall 已归档 r%d（turn %d）",
        record.ordinal,
        record.turn,
      );
    } catch (error) {
      const message = preview(String((error as Error)?.message ?? error), 240);
      this.lastError = message;
      this.logger?.warn?.("recall 归档失败：%s", message);
    }
  }

  /** 等所有排队中的归档落盘。 */
  async drain(): Promise<void> {
    await this.chain;
    await this.store.drain();
  }

  /**
   * 停止接收新事件，并等已收下的归档落盘。
   *
   * 必须等：归档是异步的，回读正文要花时间。若不等就返回，宿主会先关掉存储域，
   * 正在排队的写入就会被 `domain is closed` 拒绝。
   */
  async close(): Promise<void> {
    this.closed = true;
    await this.drain();
    this.controller.abort();
  }
}

/**
 * 订阅宿主会话事件流。
 *
 * 必须带 `{global: true}`：默认作用域过滤只把「进入本上下文」的会话事件送给监听器，
 * 而插件要记录全部会话。
 */
export function attachRecorder(
  ctx: PluginContextLike,
  recorder: RunRecorder,
): void {
  ctx.on(
    "session/event",
    (
      session: { id?: string; header?: { cwd?: string } },
      event: SessionEventLike,
    ) => {
      recorder.capture(session, event);
    },
    { global: true },
  );
}
