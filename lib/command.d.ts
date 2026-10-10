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
import type { Archive } from "./find.ts";
import type { RunStore } from "./store.ts";
export type CommandDeps = {
    archive: () => Archive | undefined;
    store: () => RunStore | undefined;
    /** 当前工作目录，用于默认的 cwd 过滤。 */
    cwd: (invocation: CommandInvocationLike) => string | undefined;
    /** 摘要失败原因，供诊断显示。 */
    summaryError: () => string | undefined;
    overviewLimit: () => number;
};
export declare function runRunsCommand(deps: CommandDeps, invocation: CommandInvocationLike): Promise<CommandResultLike>;
/** 命令描述；与工具文案同源，避免两处措辞漂移。 */
export declare const RECALL_COMMAND_DESCRIPTION = "\u6D4F\u89C8 Run \u5F52\u6863\uFF1Asearch <\u5173\u952E\u8BCD> / all / rID / rID/mID / summary rID / debug";
