/** 列表与通知只传概览；材料和实际文件差异由 dreamDetail 按需读取。 */
export function dreamSummary(job) {
    return {
        id: job.id, sessionId: job.sessionId, cwd: job.cwd, title: job.title, status: job.status,
        startedAt: job.startedAt, endedAt: job.endedAt, error: job.error,
        batchCount: job.batch.length, conclusionCount: job.conclusions.length,
        preview: (job.conclusions[0]?.text ?? job.noChangeReason).slice(0, 160),
        noChangeReason: job.noChangeReason, correctionError: job.correctionError,
    };
}
export function dreamStatusView(status) {
    return { ...status, running: status.running ? dreamSummary(status.running) : null };
}
