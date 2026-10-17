import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../tests/host-gates");
const gates = [
  ["rc2", "0.2.0-rc.2"],
  ["alpha5", "0.2.1-alpha.5"],
];

for (const [directory, version] of gates) {
  const installed = join(root, directory, "node_modules/@deepseek-ai/dsh-app-boot/package.json");
  try {
    if (JSON.parse(readFileSync(installed, "utf8")).version === version) continue;
  } catch {
    // The host package is absent or unreadable; install it below.
  }
  const result = spawnSync(
    "npm",
    ["install", "--ignore-scripts", "--no-fund", "--no-audit"],
    { cwd: join(root, directory), stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
