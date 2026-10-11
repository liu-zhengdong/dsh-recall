import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeConfig,
  type PluginConfig,
  type StartupRecallScope,
} from "../src/config.ts";
import type { RunRecord } from "../src/domain.ts";
import type { AgentLike, InjectedUserMessageLike, LoggerLike } from "../src/dsh.ts";
import {
  composeStartupRecall,
  deliverStartupRecall,
  installStartupRecall,
  isStartupRecallTarget,
  selectStartupRuns,
  STARTUP_RECALL_MAX_BYTES,
  startupRecallMessage,
} from "../src/startup.ts";
import { startupRecallLead } from "../src/wording.ts";

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "id",
    sessionId: "session",
    ordinal: 1,
    turn: 1,
    cwd: "/work",
    agentId: "agent",
    startedAt: "2026-01-02T03:04:05.000Z",
    endedAt: "2026-01-02T03:05:00.000Z",
    status: "completed",
    error: "",
    goal: "把按钮改成蓝色",
    overview: "改了按钮颜色",
    summaryError: null,
    ...overrides,
  };
}

function config(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return { ...normalizeConfig({}), ...overrides };
}

function agent(overrides: AgentLike = {}): AgentLike & { injected: InjectedUserMessageLike[] } {
  const injected: InjectedUserMessageLike[] = [];
  return {
    injected,
    inject(message) {
      injected.push(message);
    },
    session: { header: { cwd: "/work" } },
    ...overrides,
  };
}

describe("normalizeConfig startup recall", () => {
  it("defaults to on, 10 runs, current directory", () => {
    const value = normalizeConfig({});
    assert.equal(value.startupRecall, true);
    assert.equal(value.startupRecallCount, 10);
    assert.equal(value.startupRecallScope, "cwd");
    assert.equal(value.overviewLimit, 200);
    assert.equal(value.autoDream, true);
  });

  it("reads volatile fields and rejects a count or scope that is not usable", () => {
    const value = normalizeConfig({
      startupRecall: { get: () => false } as unknown as boolean,
      startupRecallCount: { get: () => 4 } as unknown as number,
      startupRecallScope: { get: () => "all" } as unknown as StartupRecallScope,
    });
    assert.equal(value.startupRecall, false);
    assert.equal(value.startupRecallCount, 4);
    assert.equal(value.startupRecallScope, "all");

    const fallback = normalizeConfig({
      startupRecallCount: 0,
      startupRecallScope: "elsewhere" as StartupRecallScope,
    });
    assert.equal(fallback.startupRecallCount, 10);
    assert.equal(fallback.startupRecallScope, "cwd");
  });
});

describe("selectStartupRuns", () => {
  const records = [
    run({ ordinal: 3, cwd: "/work" }),
    run({ ordinal: 2, cwd: "/other" }),
    run({ ordinal: 1, cwd: "/work" }),
  ];

  it("keeps the current directory and does not backfill from others", () => {
    const selected = selectStartupRuns(records, { cwd: "/work", count: 10, scope: "cwd" });
    assert.deepEqual(selected.map((record) => record.ordinal), [3, 1]);
  });

  it("returns nothing when the current directory has no runs", () => {
    assert.deepEqual(selectStartupRuns(records, { cwd: "/empty", count: 10, scope: "cwd" }), []);
  });

  it("can take every directory, still newest first and still capped", () => {
    const selected = selectStartupRuns(records, { cwd: "/empty", count: 2, scope: "all" });
    assert.deepEqual(selected.map((record) => record.ordinal), [3, 2]);
  });
});

describe("composeStartupRecall", () => {
  it("frames the index as evidence and points at recall", () => {
    const text = composeStartupRecall([
      run({ status: "failed", error: "第一行\n第二行", overview: null, goal: "修好构建" }),
      run({ ordinal: 4, status: "interrupted", error: "aborted", cwd: "/elsewhere" }),
    ], "cwd", 200);
    assert.ok(text);
    assert.equal(text.split("\n")[0], startupRecallLead(2, "cwd"));
    assert.match(text, /不是当前指令/);
    assert.match(text, /也不代表当时任务成功/);
    assert.match(text, /recall \/ recall_message/);
    assert.match(text, /r1 · 2026-01-02T03:04:05\.000Z · failed · 第一行 · 摘要未生成 · 修好构建/);
    assert.equal(text.includes("第二行"), false);
    assert.match(text, /r4 · 2026-01-02T03:04:05\.000Z · interrupted · 改了按钮颜色/);
    assert.equal(text.includes("aborted"), false);
    assert.equal(text.includes("/elsewhere"), false);
  });

  it("adds the working directory only when the scope is all directories", () => {
    const text = composeStartupRecall([run()], "all", 200);
    assert.equal(text?.split("\n")[0], startupRecallLead(1, "all"));
    assert.match(text ?? "", /r1 · 2026-01-02T03:04:05\.000Z · completed · \/work · 改了按钮颜色/);
  });

  it("drops the oldest lines until the index fits, and injects nothing if the newest line cannot", () => {
    const newest = run({ ordinal: 2, overview: "x".repeat(1600) });
    const older = run({ ordinal: 1, overview: "y".repeat(1600) });
    const fitted = composeStartupRecall([newest, older], "cwd", 2000);
    assert.ok(fitted);
    assert.match(fitted, /最近 1 条/);
    assert.match(fitted, /r2 · /);
    assert.equal(fitted.includes("r1 · "), false);
    assert.ok(Buffer.byteLength(fitted, "utf8") <= STARTUP_RECALL_MAX_BYTES);

    const tooBig = run({ overview: "z".repeat(2900) });
    assert.equal(composeStartupRecall([tooBig], "cwd", 2000), undefined);
  });
});

describe("deliverStartupRecall", () => {
  function harness(options: {
    records?: RunRecord[];
    source?: string;
    agent?: AgentLike & { injected: InjectedUserMessageLike[] };
    config?: Partial<PluginConfig>;
    ready?: Promise<{ store: { list(): RunRecord[] } }>;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}) {
    const target = options.agent ?? agent();
    const warnings: string[] = [];
    const logger: LoggerLike = { warn(format, ...param) { warnings.push(String(format), ...param.map(String)); } };
    const records = options.records ?? [run()];
    const delivered = deliverStartupRecall({
      ready: options.ready ?? Promise.resolve({ store: { list: () => records } }),
      current: () => config(options.config),
      logger,
      timeoutMs: options.timeoutMs,
      createId: () => "message-1",
    }, {
      agent: target,
      source: options.source ?? "startup",
      signal: options.signal,
    });
    return { target, warnings, delivered };
  }

  it("injects one recall message into a fresh top-level agent", async () => {
    const { target, delivered } = harness();
    await delivered;
    assert.equal(target.injected.length, 1);
    const message = target.injected[0];
    assert.ok(message);
    assert.equal(message.id, "message-1");
    assert.equal(message.role, "user");
    assert.deepEqual(message.source, { kind: "dsh-recall", form: "recall" });
    assert.match(message.content[0]?.text ?? "", /r1 · /);
    assert.equal(Object.isFrozen(message), true);
  });

  it("injects nothing when recall is off, the directory is empty, or the agent is not a fresh top-level session", async () => {
    const off = harness({ config: { startupRecall: false } });
    const empty = harness({ records: [] });
    const resumed = harness({ source: "resume" });
    const cleared = harness({ source: "clear" });
    const compacted = harness({ source: "compact" });
    const child = harness({
      agent: agent({ session: { header: { cwd: "/work", origin: "subagent", delegationDepth: 1 } } }),
    });
    const deepened = harness({ agent: agent({ options: { subagentDepth: 2 } }) });
    const aborted = harness({ signal: AbortSignal.abort() });
    await Promise.all([
      off.delivered, empty.delivered, resumed.delivered, cleared.delivered,
      compacted.delivered, child.delivered, deepened.delivered, aborted.delivered,
    ]);
    for (const item of [off, empty, resumed, cleared, compacted, child, deepened, aborted]) {
      assert.deepEqual(item.target.injected, []);
    }
  });

  it("still injects a seeded startup, because the host announces forks as startup", async () => {
    const seeded = agent({ session: { header: { cwd: "/work", isSeeded: true, parentSession: "parent" } } });
    assert.equal(isStartupRecallTarget("startup", seeded), true);
    const { target, delivered } = harness({ agent: seeded });
    await delivered;
    assert.equal(target.injected.length, 1);
  });

  it("skips when the archive is not ready in time, and does not throw if startup failed", async () => {
    const slow = harness({
      ready: new Promise(() => undefined),
      timeoutMs: 20,
    });
    await slow.delivered;
    assert.deepEqual(slow.target.injected, []);

    const broken = harness({ ready: Promise.reject(new Error("存储域打不开")) });
    await assert.doesNotReject(broken.delivered);
    assert.deepEqual(broken.target.injected, []);
    assert.deepEqual(broken.warnings, []);
  });

  it("swallows an inject failure instead of failing agent creation", async () => {
    const target = agent({
      inject() {
        throw new Error("inbox closed");
      },
    });
    const { warnings, delivered } = harness({ agent: target });
    await assert.doesNotReject(delivered);
    assert.deepEqual(warnings, ["recall 启动注入失败：%s", "inbox closed"]);
  });

  it("does not inject after the wait has already timed out", async () => {
    let resolveReady: ((value: { store: { list(): RunRecord[] } }) => void) | undefined;
    const { target, delivered } = harness({
      ready: new Promise((resolve) => { resolveReady = resolve; }),
      timeoutMs: 20,
    });
    await delivered;
    resolveReady?.({ store: { list: () => [run()] } });
    await Promise.resolve();
    assert.deepEqual(target.injected, []);
  });
});

describe("installStartupRecall", () => {
  it("listens for agent/created once, globally, and settles even when the payload is unusable", async () => {
    const calls: { event: string; options?: { global?: boolean } }[] = [];
    let listener: ((payload: unknown) => unknown) | undefined;
    const ctx = {
      on(event: string, callback: (payload: unknown) => unknown, options?: { global?: boolean }) {
        calls.push({ event, options });
        listener = callback;
        return () => true;
      },
    };
    installStartupRecall(ctx as never, {
      ready: Promise.resolve({ store: { list: () => [run()] } }),
      current: () => config(),
    });
    assert.deepEqual(calls, [{ event: "agent/created", options: { global: true } }]);
    await assert.doesNotReject(Promise.resolve(listener?.(null)));
  });
});

describe("startupRecallMessage", () => {
  it("uses the caller-supplied id, which is a plain string at runtime", () => {
    const message = startupRecallMessage("索引", "11111111-1111-4111-8111-111111111111");
    assert.equal(message.id, "11111111-1111-4111-8111-111111111111");
    assert.equal(typeof message.id, "string");
  });
});
