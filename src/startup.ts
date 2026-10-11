/**
 * 会话开始时，把最近若干条 Run 的索引注入主 Agent，只此一次。
 *
 * 钩子是 `agent/created`。宿主把这个事件标成 serial：监听器返回的 Promise
 * 结束之前，排队的输入不会放行。所以这里必须自己收口——超时、归档没就绪、
 * 一条 Run 都没有，都只是跳过，不能把异常抛回创建流程。
 *
 * 宿主 0.2.0-rc.2 的事实（`dsh-agent-loop` 与 `session-controller`）：
 * - `create` / `createAgent` 发布的 source 固定是 `startup`，fork 也走这条。
 *   延续关系记在会话头的 `isSeeded` 上，不在 source 里。
 * - `resume` 发布 `resume`。`clear` / `compact` 在类型里，该版本没有调用点。
 * - 子代理由 `dsh-subagent` 标成 `origin: "subagent"`，并把深度写进
 *   `header.delegationDepth` 与 `options.subagentDepth`。
 * - 复盘会话在 `agents.create` 之前就写进 dream 的 sessions 表，且自己就是根。
 *   `agent/created` 的载荷里没有这个标记，所以就绪后读那张表。
 */
import { randomUUID } from "node:crypto";

import type { PluginConfig, StartupRecallScope } from "./config.ts";
import type { RunRecord } from "./domain.ts";
import type {
  AgentLike,
  InjectedUserMessageLike,
  LoggerLike,
  PluginContextLike,
} from "./dsh.ts";
import { overviewLine, startupRecallLead } from "./wording.ts";

/** 等归档就绪的上限。创建流程会等这个监听器，不能再长。 */
export const STARTUP_RECALL_READY_TIMEOUT_MS = 500;
/** 整段索引的 UTF-8 上限。超出时从最旧的一条开始丢。 */
export const STARTUP_RECALL_MAX_BYTES = 3 * 1024;

export interface StartupStoreLike {
  list(): RunRecord[];
}

/** 归档就绪之后启动注入能看到的运行时。复盘归属不在 `agent/created` 载荷里。 */
export interface StartupRuntimeLike {
  store: StartupStoreLike;
  dream?: { isReviewSession(sessionId: string): boolean };
}

export interface StartupRecallDeps {
  ready: Promise<StartupRuntimeLike>;
  current: () => PluginConfig;
  logger?: LoggerLike;
  timeoutMs?: number;
  createId?: () => string;
}

interface CreatedPayload {
  agent?: AgentLike;
  source?: string;
  signal?: AbortSignal;
}

/**
 * 只注入顶层的全新会话。
 * 子代理、fork（`isSeeded`）、续接、清空、压缩都跳过。复盘会话要等存储就绪后再判。
 */
export function isStartupRecallTarget(source: string, agent: AgentLike): boolean {
  return source === "startup" && !isSubagent(agent) && agent.session?.header?.isSeeded !== true;
}

/**
 * `store.list()` 已经按序号从新到旧排过，墓碑不在这张表里。
 * 当前目录不够 N 条时不拿别的目录补。
 */
export function selectStartupRuns(
  records: readonly RunRecord[],
  options: { cwd: string; count: number; scope: StartupRecallScope },
): RunRecord[] {
  const matched = options.scope === "all"
    ? records
    : records.filter((record) => record.cwd === options.cwd);
  return matched.slice(0, options.count);
}

/** 拼索引正文。没有行，或最新的一行自己就超过上限时，返回 undefined。 */
export function composeStartupRecall(
  records: readonly RunRecord[],
  scope: StartupRecallScope,
  overviewLimit: number,
): string | undefined {
  const lines = records.map((record) => startupRecallLine(record, scope, overviewLimit));
  while (lines.length > 0 && utf8Length(renderStartupRecall(lines, scope)) > STARTUP_RECALL_MAX_BYTES) {
    lines.pop();
  }
  return lines.length === 0 ? undefined : renderStartupRecall(lines, scope);
}

export function startupRecallMessage(text: string, id: string): InjectedUserMessageLike {
  return Object.freeze({
    id,
    role: "user",
    content: Object.freeze([Object.freeze({ type: "text", text })]),
    source: Object.freeze({ kind: "dsh-recall", form: "recall" as const }),
  });
}

/**
 * 处理一次 `agent/created`。任何失败都吞掉：这个监听器抛错会让 Agent 创建失败。
 */
export async function deliverStartupRecall(
  deps: StartupRecallDeps,
  payload: CreatedPayload,
): Promise<void> {
  try {
    const config = deps.current();
    if (!config.startupRecall) return;
    const agent = payload.agent;
    const source = payload.source;
    if (agent === undefined || source === undefined) return;
    if (!isStartupRecallTarget(source, agent)) return;
    if (payload.signal?.aborted) return;

    const runtime = await waitForReady(deps.ready, deps.timeoutMs ?? STARTUP_RECALL_READY_TIMEOUT_MS);
    if (runtime === undefined || payload.signal?.aborted) return;
    const sessionId = agent.session?.id ?? agent.session?.header?.id;
    if (typeof sessionId === "string" && sessionId !== "" && runtime.dream?.isReviewSession(sessionId) === true) return;

    const selected = selectStartupRuns(runtime.store.list(), {
      cwd: agent.session?.header?.cwd ?? "",
      count: config.startupRecallCount,
      scope: config.startupRecallScope,
    });
    const text = composeStartupRecall(selected, config.startupRecallScope, config.overviewLimit);
    if (text === undefined || typeof agent.inject !== "function") return;
    agent.inject(startupRecallMessage(text, (deps.createId ?? randomUUID)()));
  } catch (error) {
    deps.logger?.warn?.(
      "recall 启动注入失败：%s",
      String((error as Error)?.message ?? error),
    );
  }
}

export function installStartupRecall(
  ctx: PluginContextLike,
  deps: StartupRecallDeps,
): void {
  ctx.on(
    "agent/created",
    ((payload: unknown) => deliverStartupRecall(deps, createdPayload(payload))) as never,
    { global: true },
  );
}

function isSubagent(agent: AgentLike): boolean {
  const header = agent.session?.header;
  if (header?.origin === "subagent") return true;
  return depthOf(header?.delegationDepth) > 0 || depthOf(agent.options?.subagentDepth) > 0;
}

function depthOf(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function startupRecallLine(
  record: RunRecord,
  scope: StartupRecallScope,
  overviewLimit: number,
): string {
  const parts = [`r${record.ordinal}`, record.startedAt, record.status];
  if (record.status === "failed") {
    const error = oneLine(record.error.split(/\r?\n/u)[0] ?? "");
    if (error !== "") parts.push(error);
  }
  if (scope === "all") parts.push(record.cwd);
  parts.push(oneLine(overviewLine(record.overview, record.goal, overviewLimit)));
  return parts.join(" · ");
}

function renderStartupRecall(lines: readonly string[], scope: StartupRecallScope): string {
  return `${startupRecallLead(lines.length, scope)}\n${lines.join("\n")}`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function utf8Length(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function createdPayload(value: unknown): CreatedPayload {
  if (value === null || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const signal = record.signal;
  return {
    agent: typeof record.agent === "object" && record.agent !== null
      ? record.agent as AgentLike
      : undefined,
    source: typeof record.source === "string" ? record.source : undefined,
    signal: signal !== null && typeof signal === "object" && "aborted" in signal
      ? signal as AbortSignal
      : undefined,
  };
}

function waitForReady(
  ready: Promise<StartupRuntimeLike>,
  timeoutMs: number,
): Promise<StartupRuntimeLike | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: StartupRuntimeLike | undefined): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    // 不 unref：创建流程只等这个 Promise。定时器若是唯一的待办，
    // 也必须能把监听器叫醒，否则超时永远不会发生。
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    ready.then(
      (value) => finish(value),
      () => finish(undefined),
    );
  });
}
