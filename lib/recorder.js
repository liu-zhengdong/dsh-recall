import { preview } from "./wording.js";
export class RunRecorder {
    store;
    loadBoundary;
    logger;
    onArchived;
    controller = new AbortController();
    /** 归档任务的串行链：回读日志 + 落库都排在同一条链上。 */
    chain = Promise.resolve();
    closed = false;
    lastError;
    constructor(options) {
        this.store = options.store;
        this.loadBoundary = options.loadBoundary;
        this.logger = options.logger;
        this.onArchived = options.onArchived;
    }
    get error() {
        return this.lastError;
    }
    /**
     * 收一条会话事件。
     *
     * 只在 `turn/end` 上动手：turn/start 之后的正文可能还在写，
     * 而 turn/end 提交时该 turn 的事件已经齐全。
     */
    capture(session, event) {
        if (this.closed)
            return;
        if (event.type !== "turn/end")
            return;
        const sessionId = typeof session.id === "string" ? session.id : "";
        if (sessionId === "")
            return;
        const turn = Number(event.data?.turn);
        if (!Number.isSafeInteger(turn) || turn < 0)
            return;
        const cwd = session.header?.cwd ?? "";
        const task = () => this.archive(sessionId, turn, cwd);
        const next = this.chain.then(task, task);
        this.chain = next.catch(() => undefined);
    }
    /** 回读该会话日志，切出目标 turn 并归档。 */
    async archive(sessionId, turn, cwd) {
        if (this.controller.signal.aborted)
            return;
        try {
            const boundary = await this.loadBoundary(sessionId, turn);
            if (boundary === undefined)
                return;
            const source = { sessionId, cwd, agentId: sessionId };
            const record = await this.store.record({
                turn: boundary.turn,
                startedAt: new Date(boundary.startTime).toISOString(),
                endedAt: new Date(boundary.endTime).toISOString(),
                status: boundary.status === "running" ? "interrupted" : boundary.status,
                error: boundary.error,
                goal: boundary.goal,
            }, source);
            this.onArchived?.(record, boundary);
            this.logger?.debug?.("recall 已归档 r%d（turn %d）", record.ordinal, record.turn);
        }
        catch (error) {
            const message = preview(String(error?.message ?? error), 240);
            this.lastError = message;
            this.logger?.warn?.("recall 归档失败：%s", message);
        }
    }
    /** 等所有排队中的归档落盘。 */
    async drain() {
        await this.chain;
        await this.store.drain();
    }
    /**
     * 停止接收新事件，并等已收下的归档落盘。
     *
     * 必须等：归档是异步的，回读正文要花时间。若不等就返回，宿主会先关掉存储域，
     * 正在排队的写入就会被 `domain is closed` 拒绝。
     */
    async close() {
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
export function attachRecorder(ctx, recorder) {
    ctx.on("session/event", (session, event) => {
        recorder.capture(session, event);
    }, { global: true });
}
