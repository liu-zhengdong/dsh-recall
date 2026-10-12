import { randomUUID } from "node:crypto";
import { basename, isAbsolute, win32 } from "node:path";
import { object } from "../content.js";
import { DREAM_BATCH_SIZE, DREAM_MIN_INTERVAL_MS, DREAM_TIMEOUT_MS, dreamSubmissionSchema } from "./domain.js";
import { dreamPrompt } from "./prompt.js";
import { DreamStore } from "./store.js";
/** 一个进程一个执行者；模型生命周期不进入串行控制队列或 session/flush。 */
export class DreamEngine {
    options;
    pending = new Map();
    knownRuns = new Set();
    headers = new Map();
    origins = new Map();
    turns = new Map();
    listeners = new Set();
    operations = new Set();
    chain = Promise.resolve();
    initialization;
    active;
    timer;
    closed = false;
    ready = false;
    lastError = null;
    constructor(options) { this.options = options; }
    get store() { return this.options.store; }
    /**
     * 这个会话是本插件创建的复盘会话。
     *
     * `begin` 在 `agents.create` 之前把复盘会话写成它自己的根（`rootSessionId === sessionId`）。
     * 从它 fork 出去的会话记的是复盘会话的 id，不是自己，因此不会被认成复盘会话。
     */
    isReviewSession(sessionId) {
        return sessionId !== "" && this.store.root(sessionId) === sessionId;
    }
    notify() { this.changed(); }
    track(operation) {
        if (this.closed)
            return Promise.reject(new Error("Dream 已关闭"));
        const pending = operation();
        this.operations.add(pending);
        void pending.then(() => this.operations.delete(pending), () => this.operations.delete(pending));
        return pending;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    changed() {
        for (const listener of this.listeners) {
            try {
                listener();
            }
            catch (error) {
                this.options.host.logger?.warn?.("Dream 订阅失败：%s", String(error));
            }
        }
    }
    enqueue(operation) {
        const next = this.chain.then(operation, operation);
        this.chain = next.catch((error) => { this.report(error); });
        return next;
    }
    report(error) {
        this.lastError = String(error?.message ?? error);
        this.options.host.logger?.warn?.("Dream：%s", this.lastError);
        this.changed();
    }
    initialize() {
        return this.initialization ??= this.enqueue(async () => {
            for (const entry of this.store.roots())
                this.origins.set(entry.sessionId, entry.rootSessionId);
            for (const job of this.store.all()) {
                this.origins.set(job.sessionId, job.sessionId);
                await this.store.rememberSession(job.sessionId, job.sessionId);
                if (["starting", "running"].includes(job.status)) {
                    await this.store.update(job.id, { status: "interrupted", endedAt: new Date().toISOString(), error: "上次进程在复盘完成前退出" });
                }
                else if (job.status === "completed") {
                    await this.store.advance(job.cwd, Math.max(...job.batch.map((run) => run.ordinal)));
                    if (job.draft)
                        await this.store.update(job.id, { draft: null, correctionError: "上次修正在正常结束前中断，保留原报告" });
                }
            }
            // 只取轻量 header 一次，按 parentSession 重建反自举归属，不回读全部正文。
            if (this.options.host.sessionQuery.listSessions) {
                const sessions = await this.options.host.sessionQuery.listSessions();
                for (const { header } of sessions)
                    if (header.id)
                        this.headers.set(header.id, header);
                await Promise.all([...this.headers.keys()].map(async (id) => {
                    const root = this.originOf(id);
                    if (root)
                        await this.store.rememberSession(id, root);
                }));
            }
            const records = this.options.runs().sort((a, b) => a.ordinal - b.ordinal);
            for (const record of records)
                this.addPending(record);
            this.ready = true;
            this.changed();
            this.schedule();
        });
    }
    /** 归档回调：只更新这一条记录，不重新调用 runs()。 */
    archived(record) {
        if (this.closed)
            return;
        void this.enqueue(async () => {
            if (this.closed)
                return;
            await this.ensureHeader(record.sessionId);
            this.addPending(record);
            this.changed();
            this.schedule();
        });
    }
    sessionCreated(session) {
        if (this.closed)
            return;
        const id = session.id ?? session.header?.id;
        if (!id)
            return;
        const alreadyKnown = this.origins.has(id);
        this.headers.set(id, { ...session.header, id });
        const root = this.originOf(id);
        if (root && !alreadyKnown) {
            this.removeSession(id);
            void this.store.rememberSession(id, root).then(() => this.changed(), (error) => this.report(error));
        }
    }
    /** 同步捕获 terminal 事实；异步落盘由独立控制队列负责。 */
    capture(session, event) {
        if (this.closed)
            return;
        this.sessionCreated(session);
        const id = session.id ?? session.header?.id;
        if (!id)
            return;
        const data = object(event.data);
        const turn = Number(data.turn);
        if (!Number.isSafeInteger(turn) || turn < 0)
            return;
        if (event.type === "turn/start") {
            this.turns.set(id, turn);
            if (this.active?.sessionId === id) {
                this.active.turn = turn;
                this.active.terminal = undefined;
            }
        }
        if (event.type !== "turn/end")
            return;
        const reason = object(data.reason);
        const kind = typeof reason.kind === "string" ? reason.kind : "unknown";
        const error = kind === "error" ? String(object(reason.error).message ?? "复盘模型失败") : kind;
        if (this.active?.sessionId === id)
            this.active.terminal = { turn, kind, error };
        else {
            const job = this.store.get(id);
            if (job?.status === "completed" && job.draft?.turn === turn) {
                void this.enqueue(async () => {
                    const latest = this.store.get(job.id);
                    if (!latest?.draft || latest.draft.turn !== turn)
                        return;
                    if (kind === "completed") {
                        await this.store.update(job.id, {
                            ...latest.draft.submission, submittedAt: latest.draft.at, submittedTurn: turn,
                            draft: null, correctionError: "",
                        });
                    }
                    else
                        await this.store.update(job.id, { draft: null, correctionError: `修正未正常完成：${error}` });
                    this.changed();
                });
            }
        }
    }
    originOf(id) {
        const path = [];
        const visited = new Set();
        let current = id;
        while (current && !visited.has(current)) {
            visited.add(current);
            const root = this.origins.get(current) ?? this.store.root(current);
            if (root) {
                for (const entry of path)
                    this.origins.set(entry, root);
                this.origins.set(id, root);
                return root;
            }
            path.push(current);
            current = this.headers.get(current)?.parentSession;
        }
        return undefined;
    }
    async ensureHeader(id) {
        if (this.headers.has(id) || this.origins.has(id))
            return;
        const live = this.options.host.sessions?.get(id);
        if (live?.header) {
            this.sessionCreated(live);
            return;
        }
        // 冷启动 listSessions 缺失的宿主按会话一次回读；错误时不把未知归属当普通材料。
        const snapshot = await this.options.host.sessionQuery.readSession(id);
        if (!snapshot.session)
            throw new Error(`无法验证会话 ${id} 的归属`);
        this.headers.set(id, snapshot.session);
        if (snapshot.session.parentSession)
            await this.ensureHeader(snapshot.session.parentSession);
        const root = this.originOf(id);
        if (root)
            await this.store.rememberSession(id, root);
    }
    addPending(record) {
        if (this.knownRuns.has(record.id))
            return;
        this.knownRuns.add(record.id);
        if (this.originOf(record.sessionId) || record.ordinal <= this.store.cursor(record.cwd) || !record.cwd)
            return;
        const records = this.pending.get(record.cwd) ?? [];
        this.pending.set(record.cwd, records);
        if (!records.length || records[records.length - 1].ordinal < record.ordinal)
            records.push(record);
        else {
            let low = 0, high = records.length;
            while (low < high) {
                const middle = Math.floor((low + high) / 2);
                if (records[middle].ordinal < record.ordinal)
                    low = middle + 1;
                else
                    high = middle;
            }
            records.splice(low, 0, record);
        }
    }
    removeSession(sessionId) {
        for (const [cwd, records] of this.pending)
            this.pending.set(cwd, records.filter((record) => record.sessionId !== sessionId));
    }
    status() {
        const config = this.options.current();
        const control = this.store.control();
        return {
            enabled: config.autoDream, paused: control.paused, threshold: config.dreamThreshold,
            pending: [...this.pending].map(([cwd, records]) => ({ cwd, count: records.length, cursor: this.store.cursor(cwd) })),
            running: this.active ? this.store.get(this.active.jobId) ?? null : null,
            lastAttempt: control.lastAttempt, sessionIds: [...this.origins.keys()], error: this.lastError,
        };
    }
    list(options = {}) { return this.store.list(options); }
    choose(cwd, automatic) {
        const threshold = automatic ? this.options.current().dreamThreshold : 1;
        if (cwd !== undefined)
            return (this.pending.get(cwd)?.length ?? 0) >= threshold ? cwd : undefined;
        let result;
        let ordinal = Infinity;
        for (const [path, records] of this.pending) {
            if (records.length >= threshold && records[0].ordinal < ordinal) {
                result = path;
                ordinal = records[0].ordinal;
            }
        }
        return result;
    }
    schedule() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        if (!this.ready || this.closed || this.active || !this.options.current().autoDream || this.store.control().paused || !this.choose(undefined, true))
            return;
        const previous = this.store.control().lastAttempt;
        const delay = previous ? Math.max(0, Date.parse(previous) + DREAM_MIN_INTERVAL_MS - Date.now()) : 0;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.enqueue(async () => {
                if (this.closed || this.active || !this.options.current().autoDream || this.store.control().paused)
                    return;
                const cwd = this.choose(undefined, true);
                if (cwd)
                    await this.begin(cwd, this.store.retry(cwd));
            });
        }, delay);
        this.timer.unref?.();
    }
    async run(cwd) {
        await this.initialize();
        return this.enqueue(async () => {
            const selected = this.choose(cwd, false);
            if (!selected)
                throw new Error("没有可复盘的未整理记录");
            return this.begin(selected, this.store.retry(selected));
        });
    }
    async retry(id) {
        await this.initialize();
        return this.enqueue(async () => {
            const job = id ? this.store.get(id) : this.store.list({ limit: 50 }).items.find((entry) => ["failed", "cancelled", "interrupted"].includes(entry.status));
            if (!job || !["failed", "cancelled", "interrupted"].includes(job.status))
                throw new Error("没有可重试的复盘");
            if (Math.max(...job.batch.map((run) => run.ordinal)) <= this.store.cursor(job.cwd))
                throw new Error("这批记录已经由后续复盘整理完成");
            return this.begin(job.cwd, job);
        });
    }
    async begin(cwd, retry) {
        if (this.closed)
            throw new Error("Dream 已关闭");
        if (this.active)
            throw new Error("已有一次复盘正在运行");
        if (!isAbsolute(cwd) && !win32.isAbsolute(cwd))
            throw new Error("复盘工作目录必须是绝对路径");
        const agents = this.options.host.agents?.root ?? this.options.host.agents;
        if (!agents)
            throw new Error("宿主缺少 agents 服务，无法创建独立复盘会话");
        const config = this.options.current();
        if ((config.dreamProvider === "") !== (config.dreamModel === ""))
            throw new Error("复盘提供方和模型必须同时填写或同时留空");
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        const records = retry?.batch ?? this.pending.get(cwd)?.slice(0, DREAM_BATCH_SIZE).map(toBatch) ?? [];
        if (!records.length)
            throw new Error("没有可复盘的材料");
        const now = new Date().toISOString();
        const sessionId = randomUUID();
        const job = {
            id: randomUUID(), sessionId, cwd, title: `${basename(cwd) || cwd} · ${records.length} 条记录`,
            status: "starting", startedAt: now, endedAt: null, error: "", batch: structuredClone(records),
            retryOf: retry?.id ?? null, conclusions: [], noChangeReason: "",
            submittedAt: null, submittedTurn: null, draft: null, correctionError: "",
        };
        const active = { jobId: job.id, sessionId, controller: new AbortController() };
        this.active = active;
        try {
            await this.store.put(job);
            this.origins.set(sessionId, sessionId);
            await this.store.rememberSession(sessionId, sessionId);
            await this.store.setControl({ lastAttempt: now });
            this.lastError = null;
            this.changed();
            // 不把整个后台模型生命周期作为 create caller 的返回 Promise；只跟踪启动事务。
            active.creation = this.launch(active, agents, job, config);
            void active.creation.catch((error) => {
                if (this.closed)
                    return;
                void this.enqueue(() => this.finish(active, active.cancellation ?? "failed", String(error?.message ?? error)));
            });
            return job;
        }
        catch (error) {
            this.active = undefined;
            throw error;
        }
    }
    async launch(active, agents, job, config) {
        // 直接调 agents.create 绕过 API session controller，没有 agent/request
        // waterfall 兜底默认模型；留空配置时必须自己解析出路由。
        const route = config.dreamProvider && config.dreamModel
            ? { provider: config.dreamProvider, model: config.dreamModel }
            : this.options.host.defaultModel?.();
        if (!route)
            throw new Error("未配置复盘模型，且宿主没有可用的默认模型");
        // 复盘会话自己建会话，拿不到宿主给普通会话挂的 preset（那条路走
        // API session controller 的 composeAgent）。这里照官方 webhook 的做法补上：
        // 先 resolve 出 id、用租约保住这次 revision、再在 setup 里挂到 agent 上下文。
        // 工具全在 preset 内，不挂就没有 bash 与读写文件的能力。
        const presets = this.options.host.agentPresets?.();
        const preset = presets ? await presets.resolve() : undefined;
        const lease = presets && preset ? await presets.acquireScope(preset.id) : undefined;
        try {
            const create = () => agents.create({
                sessionId: job.sessionId,
                meta: { cwd: job.cwd, ...(preset ? { agentPreset: preset.id } : {}) },
                signal: active.controller.signal,
                agentOptions: { provider: route.provider, model: route.model },
                setup: async (ctx, agent) => {
                    if (presets && preset)
                        await presets.mount(ctx, preset.id);
                    // 复盘会话不限制工具：维护记忆的方式由用户装了什么记忆插件决定，
                    // 任务边界写在提示词里，而不是靠工具白名单。
                    // session/title 必须带 messageSeqs 与 source，
                    // 否则会话日志校验失败（title messageSeqs requires an array）。
                    agent.session.append?.("session/title", {
                        title: job.title,
                        messageSeqs: [],
                        source: { kind: "user" },
                    });
                },
            });
            active.handle = await (agents.withoutInitiator ? agents.withoutInitiator(create) : create());
        }
        finally {
            await lease?.[Symbol.asyncDispose]();
        }
        if (this.closed || active.cancellation) {
            active.handle.agent.cancel({ kind: "disposed" });
            if (!this.closed)
                void this.enqueue(() => this.finish(active, active.cancellation ?? "interrupted", "启动时停止复盘"));
            return;
        }
        await this.store.update(job.id, { status: "running" });
        this.changed();
        if (this.closed || active.cancellation) {
            active.handle.agent.cancel({ kind: "disposed" });
            if (!this.closed)
                void this.enqueue(() => this.finish(active, active.cancellation ?? "interrupted", "启动时停止复盘"));
            return;
        }
        active.deadline = setTimeout(() => {
            active.cancellation = "interrupted";
            active.handle?.agent.cancel({ kind: "user" });
            active.controller.abort();
        }, DREAM_TIMEOUT_MS);
        active.deadline.unref?.();
        active.handle.agent.followup({ id: randomUUID(), role: "user", source: { kind: "user" }, content: [{ type: "text", text: dreamPrompt(job) }] });
        void active.handle.agent.whenIdle().then(() => {
            if (!this.closed)
                void this.enqueue(() => this.settle(active));
        }, (error) => {
            if (!this.closed)
                void this.enqueue(() => this.finish(active, "failed", String(error)));
        });
    }
    async settle(active) {
        if (this.active !== active)
            return;
        const job = this.store.get(active.jobId);
        if (!job)
            return;
        const terminal = active.terminal;
        if (active.cancellation)
            return this.finish(active, active.cancellation, "复盘已停止");
        if (!terminal || terminal.kind !== "completed") {
            const interrupted = ["aborted", "interrupted", "blocked", "forked"].includes(terminal?.kind ?? "");
            return this.finish(active, interrupted ? "interrupted" : "failed", terminal?.error ?? "会话未产生可验证的正常结束事件");
        }
        if (!job.submittedAt || job.submittedTurn !== terminal.turn)
            return this.finish(active, "failed", "会话结束，但没有通过 dream_complete 提交本轮结果");
        await this.finish(active, "completed", "");
    }
    async finish(active, status, error) {
        if (this.active !== active)
            return;
        if (active.deadline)
            clearTimeout(active.deadline);
        const job = await this.store.update(active.jobId, { status, error, endedAt: new Date().toISOString() });
        if (status === "completed") {
            const ordinal = Math.max(...job.batch.map((run) => run.ordinal));
            await this.store.advance(job.cwd, ordinal);
            this.pending.set(job.cwd, (this.pending.get(job.cwd) ?? []).filter((run) => run.ordinal > ordinal));
        }
        // 不 dispose 已发布句柄：保留正常宿主会话，用户可以继续纠正与查看轨迹。
        this.active = undefined;
        this.changed();
        this.schedule();
    }
    async stop() {
        if (this.active) {
            this.active.cancellation = "cancelled";
            this.active.controller.abort();
            this.active.handle?.agent.cancel({ kind: "user" });
        }
        this.changed();
        return this.status();
    }
    async pause(value = true) {
        await this.store.setControl({ paused: value });
        this.schedule();
        this.changed();
        return this.status();
    }
    sessionJob(sessionId) {
        const job = this.store.get(sessionId);
        if (!job || job.sessionId !== sessionId)
            throw new Error("这个工具只能在独立复盘根会话里使用");
        if (this.closed || !["running", "completed"].includes(job.status))
            throw new Error("该复盘未运行或已经失败，请重试原批次");
        return job;
    }
    async validateSources(job, sources, signal) {
        const messages = new Map();
        for (const ref of sources) {
            signal?.throwIfAborted();
            const match = /^r([1-9]\d*)(?:\/m([1-9]\d*))?$/u.exec(ref);
            const run = match ? job.batch.find((entry) => entry.ordinal === Number(match[1])) : undefined;
            if (!match || !run)
                throw new Error(`来源 ${ref} 不属于本次固定批次`);
            if (!match[2])
                continue;
            let positions = messages.get(run.id);
            if (!positions) {
                const boundary = await this.options.archive.boundaryOf(run.sessionId, run.turn, signal);
                if (!boundary)
                    throw new Error(`来源 ${ref} 的原始会话不可读`);
                positions = new Set(boundary.messages.map((entry) => entry.position));
                messages.set(run.id, positions);
            }
            if (!positions.has(Number(match[2])))
                throw new Error(`原始消息 ${ref} 不存在`);
        }
    }
    async complete(sessionId, input, signal) {
        const submission = dreamSubmissionSchema.parse(input);
        const job = this.sessionJob(sessionId);
        await this.validateSources(job, submission.conclusions.flatMap((entry) => entry.sources), signal);
        signal?.throwIfAborted();
        const turn = this.turns.get(sessionId);
        if (turn === undefined)
            throw new Error("尚未观察到复盘的 turn/start，无法提交结果");
        const at = new Date().toISOString();
        const result = await this.store.update(job.id, (latest) => {
            if (latest.status === "completed")
                return { ...latest, draft: { submission, turn, at }, correctionError: "" };
            if (latest.status !== "running")
                throw new Error("复盘已停止，不能提交结果");
            return { ...latest, ...submission, submittedAt: at, submittedTurn: turn };
        });
        this.changed();
        return result;
    }
    /** 仅取消自己的活动；不等待长模型/flush，晚到的监测回调不会继续写域。 */
    async close() {
        this.closed = true;
        if (this.timer)
            clearTimeout(this.timer);
        const active = this.active;
        if (active) {
            active.cancellation = "interrupted";
            if (active.deadline)
                clearTimeout(active.deadline);
            active.controller.abort();
            active.handle?.agent.cancel({ kind: "disposed" });
        }
        await Promise.allSettled([...this.operations]);
        await this.chain;
        if (active && this.store.get(active.jobId)) {
            await this.store.update(active.jobId, { status: "interrupted", error: "插件关闭时取消后台复盘", endedAt: new Date().toISOString() });
        }
        this.active = undefined;
        await this.store.drain();
        this.changed();
        this.listeners.clear();
    }
}
function toBatch(run) {
    return { id: run.id, ordinal: run.ordinal, sessionId: run.sessionId, turn: run.turn,
        startedAt: run.startedAt, endedAt: run.endedAt, status: run.status,
        goal: run.goal.slice(0, 1000), overview: run.overview?.slice(0, 2000) ?? null };
}
