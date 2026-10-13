import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Archive, encodeCursor } from "../src/find.ts";
import type { RunRecord } from "../src/domain.ts";
import type { SessionEventLike, SessionQueryLike } from "../src/dsh.ts";

function run(ordinal: number): RunRecord {
  return {
    id: `id-${ordinal}`,
    sessionId: `session-${ordinal}`,
    ordinal,
    turn: 1,
    cwd: "/work",
    agentId: "agent",
    startedAt: `2026-01-0${(ordinal % 9) + 1}T03:04:05.000Z`,
    endedAt: `2026-01-0${(ordinal % 9) + 1}T03:05:00.000Z`,
    status: "completed",
    error: "",
    goal: `目标 ${ordinal}`,
    overview: `概览 ${ordinal}`,
    summaryError: null,
  };
}

/** 最小 store 桩：list 返回给定记录，get 按 r<ordinal> 查。 */
function storeOf(records: RunRecord[]) {
  return {
    list: () => records,
    get: (id: string) => records.find((r) => `r${r.ordinal}` === id),
  };
}

/** 生成一个含 n 条用户消息的 turn 事件序列，正文足够长以触发分页。 */
function sessionEvents(n: number): SessionEventLike[] {
  const events: SessionEventLike[] = [
    { seq: 1, time: 1, type: "turn/start", data: { turn: 1 } },
  ];
  for (let i = 0; i < n; i++) {
    events.push({
      seq: 2 + i,
      time: 2 + i,
      type: "user/message",
      data: { id: `u-${i + 1}`, role: "user", content: `第 ${i + 1} 条消息。`.repeat(120) },
    });
  }
  events.push({ seq: 2 + n, time: 2 + n, type: "turn/end", data: { turn: 1, reason: "completed" } });
  return events;
}

function archiveOf(records: RunRecord[], events: SessionEventLike[] = []): Archive {
  return new Archive(storeOf(records) as never, {
    readSession: async () => ({ events }),
  } as unknown as SessionQueryLike);
}

describe("分页正文里的续页调用", () => {
  it("列出 Run 超过一页时，正文末行带可照抄的 recall 续页调用", async () => {
    const archive = archiveOf(Array.from({ length: 25 }, (_, i) => run(i + 1)));
    const page1 = await archive.find({ limit: 20 });
    assert.ok(page1.next?.cursor, "next.cursor 应存在");
    assert.match(
      page1.displayText,
      /继续：recall\(\{"limit":20,"cursor":"[^"]+"\}\)/,
    );
  });

  it("照抄正文里的续页调用能翻到第二页，Run 编号衔接", async () => {
    const archive = archiveOf(Array.from({ length: 25 }, (_, i) => run(i + 1)));
    const page1 = await archive.find({ limit: 20 });
    const args = JSON.parse(
      page1.displayText.match(/继续：recall\((\{.*\})\)/)?.[1] ?? "{}",
    );
    const page2 = await archive.find(args);
    assert.deepEqual(
      page2.choices.map((choice) => choice.id),
      ["r21", "r22", "r23", "r24", "r25"],
    );
  });

  it("readRun 消息列表分页：正文末行带续页调用，复用后推进", async () => {
    const archive = archiveOf([run(1)], sessionEvents(200));
    const page1 = await archive.find({ id: "r1" });
    assert.match(page1.displayText, /继续：recall\(/);
    assert.ok(page1.next?.cursor);
    const page2 = await archive.find({ id: "r1", cursor: page1.next!.cursor! });
    assert.ok(page2.displayText.length > 0);
    // 第二页从第一页结束的位置继续，不重复第一条。
    assert.notEqual(page1.displayText, page2.displayText);
  });

  it("readRun 读到末尾时正文末行是 [已读完]", async () => {
    const archive = archiveOf([run(1)], sessionEvents(2));
    const page = await archive.find({ id: "r1" });
    assert.match(page.displayText, /\[已读完\]/);
    assert.equal(page.next, undefined);
  });
});

describe("decodeCursor 对模型自编形状的归一", () => {
  const cases: Array<[string, string, number]> = [
    ["合法 base64url({offset:20})", encodeCursor({ offset: 20 }), 20],
    ["裸 JSON 数字字符串", "20", 20],
    ["数字字符串再包 base64", encodeCursor({ offset: 20 }), 20],
    ["裸对象 JSON", JSON.stringify({ offset: 40 }), 40],
  ];
  for (const [name, cursor, expected] of cases) {
    it(`${name} → offset ${expected}`, async () => {
      const archive = archiveOf(
        Array.from({ length: 45 }, (_, i) => run(i + 1)),
      );
      const page = await archive.find({ limit: 5, cursor });
      const ids = page.choices.map((choice) => choice.id);
      assert.deepEqual(ids, [
        `r${expected + 1}`,
        `r${expected + 2}`,
        `r${expected + 3}`,
        `r${expected + 4}`,
        `r${expected + 5}`,
      ]);
    });
  }

  it("彻底解析不出偏移时报错且文案不变", async () => {
    const archive = archiveOf([]);
    await assert.rejects(
      archive.find({ cursor: "not-a-cursor!" }),
      /续页游标无法解析/,
    );
  });
});
