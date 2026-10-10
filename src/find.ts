/**
 * recall 与 recall_message 的检索实现。
 *
 * 正文不在本插件里：`ctx.sessionQuery.readSession(sessionId)` 回读宿主自己的
 * 会话日志，`foldRuns` 按 turn 切分。每次调用都现读，不缓存 —— 归档条目本身
 * 是索引，正文是事实来源。
 */
import { messagePreview, messageText, object, searchText } from "./content.ts";
import type { SessionQueryLike } from "./dsh.ts";
import { foldRuns, type RunBoundary, type RunMessage } from "./events.ts";
import {
  parseQuery,
  queryHitIndex,
  queryMatches,
  type ParsedQuery,
} from "./query.ts";
import type { RunRecord, RunStore } from "./store.ts";
import { clean, NO_MATCH, NO_MESSAGES, overviewLine, PAGE_MISSED, preview } from "./wording.ts";

/** 单页正文预算（UTF-8 字节）。 */
export const OUTPUT_BYTES = 12_000;
/** 一条消息正文投影的上限；超过就拒绝，避免一次调用撑爆进程。 */
export const MAX_PROJECTION_BYTES = 8 * 1024 * 1024;
/** 一页最多列出的 Run 数。 */
export const DEFAULT_LIMIT = 20;
/** 扫描上限，防止一次调用把整个归档读完。 */
export const MAX_SCAN = 250;

export type FindArgs = {
  query?: string;
  scope?: "all" | "summary" | "content";
  cwd?: string;
  since?: string;
  until?: string;
  id?: string;
  limit?: number;
  cursor?: string;
};

export type DetailArgs = {
  id: string;
  format?: "text" | "raw";
  cursor?: string;
};

export type Choice = { id: string; label: string };

/** 一条消息的结构化摘要；readRun 结果里与 text 并存，供 UI 直接渲染。 */
export type MessageSummary = {
  id: string;
  position: number;
  role: string;
  toolName?: string;
  preview: string;
};

export type FindResult = {
  text: string;
  displayText: string;
  next?: FindArgs;
  choices: Choice[];
  /** 仅 readRun（按 id 展开 Run）时返回：本页消息的结构化列表。 */
  messages?: MessageSummary[];
};

export type DetailResult = {
  text: string;
  next?: DetailArgs;
  /** 未加分隔线包装的正文本页，供 UI 直接展示。 */
  body?: string;
  role?: string;
};

/** 游标就是下一页的参数本身；不透明化没有收益，反而挡住手工续页。 */
export function encodeCursor(
  args: FindArgs | DetailArgs | { offset: number },
): string {
  return Buffer.from(JSON.stringify(args), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    return object(value);
  } catch {
    throw new Error("续页游标无法解析；请重新发起检索。");
  }
}

function date(value: string): string {
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(Z|[+-]\d\d:\d\d)$/u.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error(
      "请使用带时区的 ISO 时间戳，例如 2026-09-15T00:00:00Z",
    );
  if (
    new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !==
    value.slice(0, 10)
  )
    throw new Error("无效的日历日期");
  return new Date(value).toISOString();
}

/** 一条 Run 的摘要侧可检索文本：概述、目标、工作目录、agent。 */
function summaryHaystack(record: RunRecord): string {
  return [
    overviewLine(record.overview, record.goal),
    record.goal,
    record.cwd,
    record.agentId,
  ]
    .filter(Boolean)
    .join("\n");
}

function header(record: RunRecord): string {
  return `r${record.ordinal}\n${record.startedAt} → ${record.endedAt}\n${record.cwd}\n${overviewLine(record.overview, record.goal)}`;
}

/** 正文按字节切页，不切开代理对。 */
export function page(body: string, at: number): { part: string; end: number } {
  let end = Math.min(body.length, at + OUTPUT_BYTES);
  while (Buffer.byteLength(body.slice(at, end), "utf8") > OUTPUT_BYTES)
    end = at + Math.floor((end - at) * 0.8);
  if (end < body.length && /[\uD800-\uDBFF]/u.test(body[end - 1] ?? "")) end--;
  return { part: body.slice(at, end), end };
}

export class Archive {
  private readonly store: RunStore;
  private readonly query: SessionQueryLike;
  private readonly logger: { warn?(format: unknown, ...param: unknown[]): void } | undefined;

  constructor(
    store: RunStore,
    query: SessionQueryLike,
    logger?: { warn?(format: unknown, ...param: unknown[]): void },
  ) {
    this.store = store;
    this.query = query;
    this.logger = logger;
  }

  /** 读取一个 run 的完整消息序列；日志读不到时返回 undefined。 */
  private async load(
    record: RunRecord,
    signal?: AbortSignal,
  ): Promise<RunBoundary | undefined> {
    signal?.throwIfAborted();
    try {
      const snapshot = await this.query.readSession(record.sessionId);
      const boundary = foldRuns(snapshot.events).find(
        (run) => run.turn === record.turn,
      );
      return boundary;
    } catch (error) {
      this.logger?.warn?.(
        "recall 读取会话 %s 失败：%o",
        record.sessionId,
        error,
      );
      return undefined;
    }
  }

  /** 回读某个会话的某个 turn；归档时用来取边界与正文。 */
  async boundaryOf(
    sessionId: string,
    turn: number,
    signal?: AbortSignal,
  ): Promise<RunBoundary | undefined> {
    signal?.throwIfAborted();
    try {
      const snapshot = await this.query.readSession(sessionId);
      return foldRuns(snapshot.events).find((run) => run.turn === turn);
    } catch (error) {
      this.logger?.warn?.(
        "recall 读取会话 %s 失败：%o",
        sessionId,
        error,
      );
      return undefined;
    }
  }

  async find(args: FindArgs, signal?: AbortSignal): Promise<FindResult> {
    const scope = args.scope ?? "all";
    const limit = args.limit ?? DEFAULT_LIMIT;
    if (scope === "content" && (args.query ?? "").trim() === "")
      throw new Error("scope=content 需要非空 query。");
    const parsed: ParsedQuery | undefined =
      (args.query ?? "").trim() === ""
        ? undefined
        : parseQuery(args.query as string);
    const since = args.since === undefined ? undefined : date(args.since);
    const until = args.until === undefined ? undefined : date(args.until);

    // 带 id：直接展开该 Run 的消息列表，不再走检索。
    if (args.id !== undefined) {
      const record = this.store.get(args.id);
      if (record === undefined) throw new Error(`没有 Run ${args.id}。`);
      return this.readRun(record, args, signal);
    }

    const offset = args.cursor === undefined ? 0 : this.cursorOffset(args.cursor);
    const matched: RunRecord[] = [];
    let more = false;
    for (const record of this.store.list()) {
      if (args.cwd !== undefined && record.cwd !== args.cwd) continue;
      if (since !== undefined && record.startedAt < since) continue;
      if (until !== undefined && record.startedAt >= until) continue;
      if (parsed !== undefined && !queryMatches(summaryHaystack(record), parsed))
        continue;
      matched.push(record);
      if (matched.length >= MAX_SCAN) break;
    }

    const window = matched.slice(offset, offset + limit);
    more = matched.length > offset + window.length;

    if (scope === "summary" || parsed === undefined)
      return this.renderRuns(window, args, more, offset + window.length);

    // content：在窗口内的 Run 里找正文命中；没有命中的 Run 不进结果。
    const start = performance.now();
    const choices: Choice[] = [];
    const parts: string[] = [];
    let read = 0;
    for (const record of window) {
      if (performance.now() - start > 1500) {
        more = true;
        break;
      }
      read++;
      const boundary = await this.load(record, signal);
      if (boundary === undefined) continue;
      const match = this.matchContent(record, boundary, parsed);
      if (match === undefined) continue;
      choices.push({
        id: `r${record.ordinal}`,
        label: `${record.startedAt} · ${preview(record.goal || "无用户文本", 120)}`,
      });
      parts.push(`${header(record)}${match}`);
      if (read % 8 === 0) await new Promise((resolve) => setImmediate(resolve));
    }

    const text = parts.join("\n\n");
    const next = more ? this.nextPage(args, offset + window.length) : undefined;
    return {
      text,
      displayText:
        text !== "" ? text : more ? PAGE_MISSED : NO_MATCH,
      ...(next !== undefined ? { next } : {}),
      choices,
    };
  }

  /** 续页参数：沿用原筛选条件，只把游标推进到下一页起点。 */
  private nextPage(args: FindArgs, offset: number): FindArgs {
    return {
      ...args,
      limit: args.limit ?? DEFAULT_LIMIT,
      cursor: encodeCursor({ offset }),
    };
  }

  /** 在正文里找命中位置，返回可读的命中行。 */
  private matchContent(
    record: RunRecord,
    boundary: RunBoundary,
    parsed: ParsedQuery,
  ): string | undefined {
    for (const entry of boundary.messages) {
      const haystack = searchText(entry.message);
      if (haystack === "") continue;
      const index = queryHitIndex(haystack, parsed);
      if (index === -1) continue;
      const ref = `r${record.ordinal}/m${entry.position}`;
      const snippet = preview(
        haystack.slice(Math.max(0, index - 80)).replaceAll("\n", " "),
        240,
      );
      return `\n命中 ${ref} · ${snippet}\nrecall_message({"id":"${ref}"})`;
    }
    return undefined;
  }

  /** 不带 query 或 scope=summary：列出 Run 概览。 */
  private renderRuns(
    records: readonly RunRecord[],
    args: FindArgs,
    more: boolean,
    offset: number,
  ): FindResult {
    const choices: Choice[] = records.map((record) => ({
      id: `r${record.ordinal}`,
      label: `${record.startedAt} · ${preview(record.goal || "无用户文本", 120)}`,
    }));
    const parts = records.map(
      (record) => `${header(record)}\nrecall({"id":"r${record.ordinal}"})`,
    );
    const text = parts.join("\n\n");
    const next = more ? this.nextPage(args, offset) : undefined;
    return {
      text,
      displayText:
        records.length > 0
          ? text
          : args.query === undefined
            ? `当前范围还没有 Run。开始对话后会自动记录${args.cwd === undefined ? "。" : "；省略 cwd 可查看全库。"}`
            : NO_MATCH,
      ...(next !== undefined ? { next } : {}),
      choices,
    };
  }

  /** 展开一个 Run 的消息列表。 */
  private async readRun(
    record: RunRecord,
    args: FindArgs,
    signal?: AbortSignal,
  ): Promise<FindResult> {
    const boundary = await this.load(record, signal);
    if (boundary === undefined)
      return {
        text: "",
        displayText: `Run r${record.ordinal} 的正文已不可读（会话日志缺失）。`,
        choices: [],
      };
    const at = args.cursor === undefined ? 0 : this.cursorOffset(args.cursor);
    const lines: string[] = [];
    const summaries: MessageSummary[] = [];
    let index = at;
    let bytes = 0;
    for (; index < boundary.messages.length; index++) {
      const entry = boundary.messages[index] as RunMessage;
      const text = preview(messagePreview(entry.message, entry.toolName), 800);
      const line = `${entry.position}. ${entry.role}${entry.toolName ? ` ${entry.toolName}` : ""} · r${record.ordinal}/m${entry.position}\n${text}`;
      const size = Buffer.byteLength(line, "utf8");
      if (bytes + size > OUTPUT_BYTES && lines.length > 0) break;
      lines.push(line);
      bytes += size;
      summaries.push({
        id: `r${record.ordinal}/m${entry.position}`,
        position: entry.position,
        role: entry.role,
        ...(entry.toolName ? { toolName: entry.toolName } : {}),
        preview: text,
      });
    }
    const body = lines.join("\n\n");
    const next =
      index < boundary.messages.length
        ? { id: args.id as string, cursor: encodeCursor({ offset: index }) }
        : undefined;
    return {
      text: body,
      displayText: body === "" ? NO_MESSAGES : body,
      ...(next ? { next: { ...args, cursor: next.cursor } } : {}),
      choices: boundary.messages.map((entry) => ({
        id: `r${record.ordinal}/m${entry.position}`,
        label: `${entry.role}${entry.toolName ? ` ${entry.toolName}` : ""}`,
      })),
      messages: summaries,
    };
  }

  private cursorOffset(cursor: string): number {
    const value = decodeCursor(cursor);
    const offset = value.offset;
    return typeof offset === "number" && Number.isSafeInteger(offset) && offset >= 0
      ? offset
      : 0;
  }

  /** 读取一条消息的全文，按 12KB 分页。 */
  async detail(args: DetailArgs): Promise<DetailResult> {
    const { record, entry } = await this.resolveMessage(args.id);
    const raw = args.format === "raw";
    const body = raw
      ? JSON.stringify(entry.message, null, 2)
      : messageText(entry.message, entry.toolName);
    // 投影要把整条消息展开进内存；超大消息（编码附件、巨型工具结果）
    // 会一次撑爆进程，所以先量字节再决定。raw 模式同样受此限制，
    // 只是它的产物体积更可预测。
    if (Buffer.byteLength(body, "utf8") > MAX_PROJECTION_BYTES)
      throw new Error(
        `消息投影超过 8 MiB，无法读取：${JSON.stringify({ id: args.id, format: raw ? "raw" : "text" })}`,
      );
    const at = args.cursor === undefined ? 0 : this.cursorOffset(args.cursor);
    const { part, end } = page(body, at);
    const role = entry.role;
    const format = raw ? "原始 JSON" : "消息详情";
    const next =
      end < body.length
        ? { id: args.id, ...(raw ? { format: "raw" as const } : {}), cursor: encodeCursor({ offset: end }) }
        : undefined;
    const text = `${args.id} · ${role} · ${format}\n正文位于分隔线之间，按顺序拼接各页即可还原。\n---\n${part}\n---\n${next ? `继续：recall_message(${JSON.stringify(next)})` : "[已读完]"}`;
    return { text, ...(next ? { next } : {}), body: part, role };
  }

  /** 解析 `r12/m3`、`m3`（本会话内不唯一，故需 Run 前缀）或消息 UUID。 */
  private async resolveMessage(
    id: string,
  ): Promise<{ record: RunRecord; entry: RunMessage }> {
    const scoped = /^r(\d+)\/m(\d+)$/u.exec(id.trim());
    if (scoped !== null) {
      const ordinal = Number(scoped[1]);
      const position = Number(scoped[2]);
      const record = this.store.get(`r${ordinal}`);
      if (record === undefined) throw new Error(`没有 Run r${ordinal}。`);
      const boundary = await this.load(record);
      const entry = boundary?.messages.find((item) => item.position === position);
      if (entry === undefined) throw new Error(`Run r${ordinal} 没有消息 m${position}。`);
      return { record, entry };
    }
    // 全局 m 号与消息 UUID：逐条 Run 回读查找。
    for (const record of this.store.list()) {
      const boundary = await this.load(record);
      if (boundary === undefined) continue;
      const entry = boundary.messages.find(
        (item) => item.id === id || `m${item.position}` === id,
      );
      if (entry !== undefined) return { record, entry };
    }
    throw new Error(`找不到消息 ${id}；请先用 recall 取回消息 ID。`);
  }
}

/** 工具结果里的 choices 裁剪：只留前三条，避免把整页塞进 meta。 */
export function findDetails(page: FindResult): {
  page: { count: number; more: boolean; choices: Choice[] };
} {
  return {
    page: {
      count: page.choices.length,
      more: page.next !== undefined,
      choices: page.choices.slice(0, 3),
    },
  };
}

export { clean };
