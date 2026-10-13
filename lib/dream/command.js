/** 人用命令与侧栏共用同一个引擎，不创建第二套调度状态。 */
export function registerDreamCommand(commands, engine) {
    commands?.register({
        name: "dream",
        description: "查看复盘状态、立即复盘、停止本次或暂停自动复盘",
        input: { hint: "status | run | stop | pause | resume | retry <复盘 ID>" },
        async handler(invocation) {
            try {
                const value = engine();
                const input = (invocation.rawInput ?? "").trim();
                const [action = "status", ...rest] = input.split(/\s+/);
                if (action === "run") {
                    const job = await value.run();
                    return { kind: "success", text: `已启动复盘：${job.id}。打开「复盘」页签查看会话。` };
                }
                if (action === "stop") {
                    await value.stop();
                    return { kind: "success", text: "已请求停止本次复盘；自动复盘开关保持原值。" };
                }
                if (action === "pause" || action === "resume") {
                    await value.pause(action === "pause");
                    return { kind: "success", text: action === "pause" ? "已暂停自动复盘；当前复盘继续运行。" : "已恢复自动复盘。" };
                }
                if (action === "retry") {
                    const id = rest.join(" ");
                    if (!id)
                        return { kind: "error", text: "提供失败复盘的 ID：/dream retry <ID>" };
                    const job = await value.retry(id);
                    return { kind: "success", text: `已启动重试：${job.id}。材料范围沿用原批次。` };
                }
                if (action !== "status" && action !== "")
                    return { kind: "error", text: "用法：/dream status | run | stop | pause | resume | retry <ID>" };
                const status = value.status();
                return { kind: "success", text: [
                        `自动复盘：${status.enabled && !status.paused ? "开启" : "暂停"}；门槛 ${status.threshold} 条。`,
                        status.running ? `正在复盘：${status.running.id}` : "当前没有运行中的复盘。",
                        `待整理 ${status.pendingCount} 条。`,
                        status.error ? `错误：${status.error}` : "",
                    ].filter(Boolean).join("\n") };
            }
            catch (error) {
                return { kind: "error", text: String(error?.message ?? error) };
            }
        },
    });
}
