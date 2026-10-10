/**
 * `/runs` 人类命令：浏览归档、检索、看诊断。
 *
 * DSH 的命令只能返回文本（宿主没有 pi 的 TUI 面板 API），
 * 所以这里把结果压成一段可直接读的文本。
 *
 * 输入语法与 pi 版一致：
 *   （空）          当前目录最近的 Run
 *   search <关键词>  检索当前目录
 *   all            全库最近的 Run
 *   r12            展开某条 Run 的消息列表
 *   r12/m3         读某条消息
 *   summary r12    只看某条 Run 的摘要
 *   debug          诊断信息
 */
import type { CommandInvocationLike, CommandResultLike } from "./dsh.ts";
import type { Archive, FindArgs } from "./find.ts";
import type { RunStore } from "./store.ts";
import { overviewLine } from "./wording.ts";

export type CommandDeps = {
  archive: () => Archive | undefined;
  store: () => RunStore | undefined;
  /** 当前工作目录，用于默认的 cwd 过滤。 */
  cwd: (invocation: CommandInvocationLike) => string | undefined;
  /** 摘要失败原因，供诊断显示。 */
  summaryError: () => string | undefined;
  overviewLimit: () => number;
};

function fail(text: string): CommandResultLike {
  return { kind: "error", text };
}

function ok(text: string): CommandResultLike {
  return { kind: "success", text };
}

export async function runRunsCommand(
  deps: CommandDeps,
  invocation: CommandInvocationLike,
): Promise<CommandResultLike> {
  const archive = deps.archive();
  const store = deps.store();
  if (archive === undefined || store === undefined)
    return fail("Run 归档尚未就绪；请稍后重试。");
  const input = (invocation.rawInput ?? "").trim();

  if (input === "debug") {
    const records = store.list();
    return ok(
      JSON.stringify(
        {
          domain: "run_archive",
          runs: records.length,
          tombstones: store.tombstoneCount(),
          summaryFailures: store.countSummaryFailures(),
          summaryError: deps.summaryError() ?? null,
          latest: records.slice(0, 5).map((record) => ({
            id: `r${record.ordinal}`,
            sessionId: record.sessionId,
            turn: record.turn,
            status: record.status,
            overview: record.overview !== null,
            summaryError: record.summaryError,
          })),
        },
        null,
        2,
      ),
    );
  }

  const detail = /^(r[1-9]\d*)\/m(\d+)$/u.exec(input);
  if (detail !== null) {
    const result = await archive.detail({ id: `${detail[1]}/m${detail[2]}` });
    return ok(result.text);
  }

  const run = /^(r[1-9]\d*)$/u.exec(input);
  if (run !== null) {
    const result = await archive.find({ id: run[1] as string });
    return ok(result.displayText);
  }

  const summary = /^summary\s+(r[1-9]\d*)$/u.exec(input);
  if (summary !== null) {
    const record = store.get(summary[1] as string);
    if (record === undefined) return fail(`没有 Run ${summary[1]}。`);
    const limit = deps.overviewLimit();
    const head = `r${record.ordinal} · ${record.startedAt} → ${record.endedAt}\n${record.cwd}\n${record.status}${record.error ? ` · ${record.error}` : ""}`;
    const body = overviewLine(record.overview, record.goal, limit);
    const note =
      record.summaryError === null ? "" : `\n摘要失败：${record.summaryError}`;
    return ok(`${head}\n\n${body}${note}`);
  }

  const cwd = deps.cwd(invocation);
  const args: FindArgs =
    input === "all"
      ? {}
      : {
          ...(cwd === undefined ? {} : { cwd }),
          ...(input === "" || input === "search"
            ? {}
            : {
                query: input.startsWith("search ")
                  ? input.slice("search ".length).trim()
                  : input,
              }),
        };
  const result = await archive.find(args);
  return ok(result.displayText);
}

/** 命令描述；与工具文案同源，避免两处措辞漂移。 */
export const RUNS_COMMAND_DESCRIPTION =
  "浏览 Run 归档：search <关键词> / all / rID / rID/mID / summary rID / debug";
