import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, realpath } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { z } from "zod";
import { DREAM_FILE_BYTES, DREAM_MAX_CHANGES } from "./domain.js";
export const memoryInputSchema = z.object({
    action: z.enum(["list", "read", "write"]), path: z.string().default(""),
    content: z.string().optional(), expectedBefore: z.string().nullable().optional(),
    sources: z.array(z.string()).max(30).default([]),
}).strict();
/** 目录边界、符号链接、文件类型与大小在真正写入处核对，不靠 Agent 自律。 */
async function targetPath(root, name, writing, directory = false) {
    if (!name || isAbsolute(name) || win32.isAbsolute(name))
        throw new Error("记忆文件必须使用目录内的相对路径");
    const parts = name.split(/[\\/]/u);
    if (parts.some((part) => part === ".." || part.startsWith(".") || /^(?:agents|skill|system|runtime-context|turn-reminder|agents-reminder)\.md$/iu.test(part))) {
        throw new Error("不能写隐藏路径、指令文件或目录外的文件");
    }
    if (!directory && extname(name).toLowerCase() !== ".md")
        throw new Error("记忆工具只接受 .md 文件");
    const candidate = resolve(root, ...parts);
    if (!inside(root, candidate))
        throw new Error("记忆路径超出配置目录");
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
        throw new Error("记忆目录必须是实际目录，不能是符号链接");
    const canonicalRoot = await realpath(root);
    let current = root;
    for (const part of parts.slice(0, -1)) {
        current = join(current, part);
        try {
            const stat = await lstat(current);
            if (!stat.isDirectory() || stat.isSymbolicLink())
                throw new Error("记忆路径不能经过符号链接或普通文件");
        }
        catch (error) {
            if (!isMissing(error) || !writing)
                throw error;
            await mkdir(current);
        }
        if (!inside(canonicalRoot, await realpath(current)))
            throw new Error("记忆路径解析到了目录外");
    }
    try {
        const stat = await lstat(candidate);
        if ((directory ? !stat.isDirectory() : !stat.isFile()) || stat.isSymbolicLink())
            throw new Error("记忆目标类型不正确，不能是符号链接");
    }
    catch (error) {
        if (!isMissing(error) || directory)
            throw error;
    }
    return candidate;
}
function inside(root, target) {
    const path = relative(root, target);
    return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}
function isMissing(error) { return error?.code === "ENOENT"; }
async function readBounded(path) {
    try {
        const stat = await lstat(path);
        if (stat.size > DREAM_FILE_BYTES)
            throw new Error("单篇记忆超过 64 KiB");
        const text = await readFile(path, "utf8");
        if (Buffer.byteLength(text, "utf8") > DREAM_FILE_BYTES)
            throw new Error("单篇记忆超过 64 KiB");
        return text;
    }
    catch (error) {
        if (isMissing(error))
            return null;
        throw error;
    }
}
export async function runMemory(engine, sessionId, input, signal) {
    const job = engine.sessionJob(sessionId);
    const root = job.memoryDirectory;
    if (!root)
        throw new Error("未配置记忆目录；请用 dream_complete 保存复盘结论");
    signal?.throwIfAborted();
    if (input.action === "list") {
        const listPath = input.path ? await targetPath(root, input.path, false, true) : root;
        const directory = await lstat(listPath);
        if (!directory.isDirectory() || directory.isSymbolicLink())
            throw new Error("记忆目录必须是实际目录");
        const entries = await readdir(listPath, { withFileTypes: true });
        return { directory: listPath, entries: entries.filter((entry) => !entry.name.startsWith(".") && !entry.isSymbolicLink())
                .filter((entry) => entry.isDirectory() || entry.name.toLowerCase().endsWith(".md"))
                .slice(0, 200).map((entry) => ({ name: entry.name, directory: entry.isDirectory() })), truncated: entries.length > 200 };
    }
    if (input.action === "write") {
        if (input.content === undefined || input.expectedBefore === undefined)
            throw new Error("write 必须提供 content 和 read 得到的 expectedBefore（新文件用 null）");
        if (Buffer.byteLength(input.content, "utf8") > DREAM_FILE_BYTES)
            throw new Error("单篇记忆不能超过 64 KiB");
        if (!input.sources.length)
            throw new Error("记忆写入必须提供本批来源");
        if (job.changes.length >= DREAM_MAX_CHANGES)
            throw new Error("本次复盘最多记录 20 次记忆写入");
        await engine.validateSources(job, input.sources, signal);
        // 配置本身是用户授权的写入目的地；只在不存在时创建，已有符号链接仍拒绝。
        await mkdir(root, { recursive: true });
    }
    const path = await targetPath(root, input.path, input.action === "write");
    const before = await readBounded(path);
    if (input.action === "read")
        return { path, content: before };
    if (before !== input.expectedBefore)
        throw new Error("记忆文件已被其他操作修改，请重新读取后再合并");
    signal?.throwIfAborted();
    const change = { path, before, after: before, sources: input.sources, at: new Date().toISOString(), verified: false, error: "" };
    // 写之前持久化 before，崩溃也不会丢掉已有改动的审阅依据。
    const index = job.changes.length;
    await engine.store.update(job.id, (latest) => {
        if (latest.changes.length >= DREAM_MAX_CHANGES)
            throw new Error("记忆写入次数达到上限");
        return { ...latest, changes: [...latest.changes, change] };
    });
    engine.notify();
    try {
        signal?.throwIfAborted();
        const flags = constants.O_RDWR | (before === null ? constants.O_CREAT | constants.O_EXCL : 0) | (constants.O_NOFOLLOW ?? 0);
        const file = await open(path, flags, 0o600);
        try {
            const stat = await file.stat();
            if (!stat.isFile() || stat.size > DREAM_FILE_BYTES)
                throw new Error("记忆目标不是可写入的普通文件或已超限");
            if (before !== null && await file.readFile("utf8") !== before)
                throw new Error("记忆文件在写入前已变化，请重新读取");
            signal?.throwIfAborted();
            await file.truncate(0);
            const bytes = Buffer.from(input.content, "utf8");
            let written = 0;
            while (written < bytes.length) {
                const result = await file.write(bytes, written, bytes.length - written, written);
                if (result.bytesWritten === 0)
                    throw new Error("记忆写入未产生进展");
                written += result.bytesWritten;
            }
            await file.sync();
        }
        finally {
            await file.close();
        }
        const after = await readBounded(path);
        change.after = after;
        change.verified = after === input.content;
        if (!change.verified)
            throw new Error("记忆写入后的内容与提交内容不一致");
    }
    catch (error) {
        change.error = String(error?.message ?? error);
        try {
            change.after = await readBounded(path);
        }
        catch {
            change.after = null;
        }
    }
    await engine.store.update(job.id, (latest) => {
        const changes = [...latest.changes];
        changes[index] = change;
        return { ...latest, changes };
    });
    engine.notify();
    if (!change.verified)
        throw new Error(change.error);
    return { path, verified: true, before: change.before, after: change.after };
}
