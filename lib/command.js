import { overviewLine } from "./wording.js";
function fail(text) {
    return { kind: "error", text };
}
function ok(text) {
    return { kind: "success", text };
}
export async function runRunsCommand(deps, invocation) {
    const archive = deps.archive();
    const store = deps.store();
    if (archive === undefined || store === undefined)
        return fail("Run 归档尚未就绪；请稍后重试。");
    const input = (invocation.rawInput ?? "").trim();
    if (input === "debug") {
        const records = store.list();
        return ok(JSON.stringify({
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
        }, null, 2));
    }
    const detail = /^(r[1-9]\d*)\/m(\d+)$/u.exec(input);
    if (detail !== null) {
        const result = await archive.detail({ id: `${detail[1]}/m${detail[2]}` });
        return ok(result.text);
    }
    const run = /^(r[1-9]\d*)$/u.exec(input);
    if (run !== null) {
        const result = await archive.find({ id: run[1] });
        return ok(result.displayText);
    }
    const summary = /^summary\s+(r[1-9]\d*)$/u.exec(input);
    if (summary !== null) {
        const record = store.get(summary[1]);
        if (record === undefined)
            return fail(`没有 Run ${summary[1]}。`);
        const limit = deps.overviewLimit();
        const head = `r${record.ordinal} · ${record.startedAt} → ${record.endedAt}\n${record.cwd}\n${record.status}${record.error ? ` · ${record.error}` : ""}`;
        const body = overviewLine(record.overview, record.goal, limit);
        const note = record.summaryError === null ? "" : `\n摘要失败：${record.summaryError}`;
        return ok(`${head}\n\n${body}${note}`);
    }
    const cwd = deps.cwd(invocation);
    const args = input === "all"
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
export const RECALL_COMMAND_DESCRIPTION = "浏览 Run 归档：search <关键词> / all / rID / rID/mID / summary rID / debug";
