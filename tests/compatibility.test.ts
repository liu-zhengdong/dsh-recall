import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const DSH_RANGE = "0.2.0-rc.2 || 0.2.1-alpha.5";
const DSH_PEERS = [
  "@deepseek-ai/dsh-agent",
  "@deepseek-ai/dsh-commands",
  "@deepseek-ai/dsh-llm",
  "@deepseek-ai/dsh-session",
  "@deepseek-ai/dsh-session-query",
  "@deepseek-ai/dsh-storage-domain",
  "@deepseek-ai/dsh-tools",
];

describe("DSH version gate", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    engines: { dsh: string };
    peerDependencies: Record<string, string>;
    dsh: { compatibility: { dshReleases: Record<string, string> } };
  };

  it("declares the same range in engines.dsh and every DSH peer", () => {
    assert.equal(manifest.engines.dsh, DSH_RANGE);
    for (const name of DSH_PEERS) {
      assert.equal(manifest.peerDependencies[name], DSH_RANGE);
    }
  });

  it("marks both checked releases compatible", () => {
    assert.deepEqual(manifest.dsh.compatibility.dshReleases, {
      "0.2.0-rc.2": "compatible",
      "0.2.1-alpha.5": "compatible",
    });
  });
});
