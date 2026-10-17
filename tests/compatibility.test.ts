import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

type PrereleaseVersion = { prerelease: unknown[] };
type PrereleaseComparator = { semver: PrereleaseVersion; test(version: PrereleaseVersion): boolean };
type SemverLike = {
  SemVer: new (version: string, options?: object) => PrereleaseVersion;
  Range: new (range: string, options?: object) => {
    test(version: PrereleaseVersion): boolean;
    set: PrereleaseComparator[][];
  };
};

/**
 * 两边宿主的 `evaluatePluginCompatibility`。
 * `0.2.0-rc.2` 只读 DSH peer，`0.2.1-alpha.5` 在声明了 `engines.dsh` 时只读该字段。
 * 两者匹配范围都走 `semver.satisfies(version, range, { includePrerelease: true })`。
 */
type HostGate = (
  manifest: object,
  exemptions?: Readonly<Record<string, readonly string[]>>,
  runtimeVersion?: string,
) => unknown;

const gateEntry = {
  rc2: new URL("./host-gates/rc2/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js", import.meta.url),
  alpha5: new URL("./host-gates/alpha5/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js", import.meta.url),
} as const;
const DSH_RANGE = ">=0.2.0-rc.2 <0.3.0-0";
const OPEN_UPPER = ">=0.2.0-rc.2 <0.3.0";
const DSH_PEERS = [
  "@deepseek-ai/dsh-agent",
  "@deepseek-ai/dsh-commands",
  "@deepseek-ai/dsh-llm",
  "@deepseek-ai/dsh-session",
  "@deepseek-ai/dsh-session-query",
  "@deepseek-ai/dsh-storage-domain",
  "@deepseek-ai/dsh-tools",
];
const ACCEPTED = ["0.2.0-rc.2", "0.2.1-alpha.5", "0.2.1-alpha.9", "0.2.2-alpha.1", "0.2.5"];
const REJECTED = ["0.2.0-rc.1", "0.3.0-0", "0.3.0-alpha.1", "0.3.0"];

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  engines: { dsh: string };
  peerDependencies: Record<string, string>;
  dsh: { compatibility: { dshReleases: Record<string, string> } };
};

async function hostGate(entry: URL): Promise<HostGate> {
  const loaded = (await import(entry.href)) as { evaluatePluginCompatibility: HostGate };
  return loaded.evaluatePluginCompatibility;
}

/**
 * pnpm 10.33.4 `resolvePeers` 调用的 `@yarnpkg/core` `satisfiesWithPrereleases`。
 * 先按 `includePrerelease: true` 测；失败后再剥掉预发布号重测。每次新建 Range，避免改写缓存。
 */
function pnpmSatisfies(version: string, range: string): boolean {
  const semver = createRequire(gateEntry.alpha5)("semver") as SemverLike;
  const semverRange = new semver.Range(range, { includePrerelease: true, loose: true });
  const semverVersion = new semver.SemVer(version, { includePrerelease: true, loose: true });
  if (semverRange.test(semverVersion)) return true;
  if (semverVersion.prerelease.length > 0) semverVersion.prerelease = [];
  return semverRange.set.some((comparatorSet) => {
    for (const comparator of comparatorSet) {
      if (comparator.semver.prerelease.length > 0) comparator.semver.prerelease = [];
    }
    return comparatorSet.every((comparator) => comparator.test(semverVersion));
  });
}

function withRange(range: string): object {
  const copy = structuredClone(manifest);
  copy.engines.dsh = range;
  for (const name of DSH_PEERS) copy.peerDependencies[name] = range;
  return copy;
}

const rcGate = await hostGate(gateEntry.rc2);
const alphaGate = await hostGate(gateEntry.alpha5);

describe("DSH version gate", () => {
  const gates = [
    ["0.2.0-rc.2", rcGate],
    ["0.2.1-alpha.5", alphaGate],
  ] as const;

  it("declares one 0.2.x range on engines.dsh, every DSH peer, and the compatibility map", () => {
    assert.equal(manifest.engines.dsh, DSH_RANGE);
    for (const name of DSH_PEERS) assert.equal(manifest.peerDependencies[name], DSH_RANGE);
    assert.deepEqual(manifest.dsh.compatibility.dshReleases, { [DSH_RANGE]: "compatible" });
  });

  for (const [host, gate] of gates) {
    for (const version of ACCEPTED) {
      it(`${host} accepts ${version}`, () => {
        assert.equal(gate(manifest, {}, version), undefined);
      });
    }
    for (const version of REJECTED) {
      it(`${host} rejects ${version}`, () => {
        assert.notEqual(gate(manifest, {}, version), undefined);
      });
    }
    it(`${host} would accept 0.3.0-alpha.1 if the upper bound were <0.3.0`, () => {
      assert.equal(gate(withRange(OPEN_UPPER), {}, "0.3.0-alpha.1"), undefined);
    });
  }

  it("pnpm 10 peer resolution satisfies future 0.2.x prereleases and rejects 0.3", () => {
    // pnpm 先用 includePrerelease 测。失败后会剥掉预发布号再测一次，
    // 所以 0.2.0-rc.1 会被当成 0.2.0 放行；宿主门不会。0.3 的预发布剥掉后仍是 0.3.0，过不了 <0.3.0。
    for (const version of ACCEPTED) assert.equal(pnpmSatisfies(version, DSH_RANGE), true, version);
    for (const version of ["0.3.0-alpha.1", "0.3.0"]) {
      assert.equal(pnpmSatisfies(version, DSH_RANGE), false, version);
    }
  });
});
