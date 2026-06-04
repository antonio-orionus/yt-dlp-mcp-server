import { scriptSummary } from "./validation/common.js";
import { spawnSync } from "node:child_process";
import { paths, runPnpm } from "./validation/run.js";

runPnpm(["install", "--frozen-lockfile"], paths.errorsRoot);
runPnpm(["run", "typecheck"], paths.errorsRoot);
runPnpm(["run", "test"], paths.errorsRoot);
runPnpm(["run", "build"], paths.errorsRoot);

runPnpm(["install", "--frozen-lockfile"], paths.bridgeRoot);
if (canImportYtDlp()) {
  runPnpm(["run", "verify:options"], paths.bridgeRoot);
} else {
  console.warn("Skipping bridge verify:options locally because Python module `yt_dlp` is not importable. Docker release validation runs this reproducibly.");
}
runPnpm(["run", "typecheck"], paths.bridgeRoot);
runPnpm(["run", "test"], paths.bridgeRoot);
runPnpm(["run", "build"], paths.bridgeRoot);

runPnpm(["install", "--frozen-lockfile"]);
runPnpm(["run", "typecheck"]);
runPnpm(["run", "typecheck:scripts"]);
runPnpm(["run", "test"]);
runPnpm(["run", "build"]);
runPnpm(["run", "test:mcp-contract"]);
runPnpm(["run", "audit:outputs"]);
runPnpm(["run", "smoke:real"]);

scriptSummary("validate-local", { ok: true });

function canImportYtDlp(): boolean {
  const result = spawnSync(process.env.PYTHON ?? "python3", ["-c", "import yt_dlp"], { stdio: "ignore" });
  return result.status === 0;
}
