import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RunRecord } from "../src/domain.ts";
import type { DomainLike, KvTableLike } from "../src/dsh.ts";
import type { RunBoundary } from "../src/events.ts";
import { RunRecorder } from "../src/recorder.ts";
import { RunStore } from "../src/store.ts";

function memoryDomain(): DomainLike {
  return {
    table(name: string): KvTableLike<unknown> {
      const rows = new Map<string, unknown>();
      return {
        get: (key) => rows.get(`${name}:${key}`),
        entries: () => rows.entries(),
        get size() { return rows.size; },
        put: (key, value) => {
          rows.set(`${name}:${key}`, value);
          return Promise.resolve();
        },
        delete: (key) => Promise.resolve(rows.delete(`${name}:${key}`)),
      };
    },
  };
}

function boundary(turn: number): RunBoundary {
  return {
    turn,
    startSeq: 1,
    endSeq: 9,
    startTime: 0,
    endTime: 1,
    status: "completed",
    error: "",
    messages: [],
    goal: "目标",
  };
}

function harness(skipSession?: (sessionId: string) => boolean) {
  const archived: RunRecord[] = [];
  const store = new RunStore(memoryDomain());
  const recorder = new RunRecorder({
    store,
    loadBoundary: (sessionId, turn) =>
      Promise.resolve(boundary(turn)),
    skipSession,
    onArchived: (record) => archived.push(record),
  });
  return { recorder, store, archived };
}

function endTurn(sessionId: string, recorder: RunRecorder): void {
  recorder.capture(
    { id: sessionId, header: { cwd: "/work" } },
    { type: "turn/end", data: { turn: 1, reason: { kind: "completed" } } },
  );
}

describe("RunRecorder", () => {
  it("archives ordinary sessions", async () => {
    const { recorder, store } = harness();
    endTurn("session", recorder);
    await recorder.drain();
    assert.equal(store.list().length, 1);
  });

  it("skips sessions named by skipSession, so they become neither a Run nor a summary", async () => {
    const { recorder, store, archived } = harness((id) => id === "review");
    endTurn("review", recorder);
    endTurn("session", recorder);
    await recorder.drain();
    assert.equal(store.list().length, 1);
    assert.deepEqual(archived.map((record) => record.sessionId), ["session"]);
  });
});
