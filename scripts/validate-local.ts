import { scriptSummary } from "./validation/common.js";
import { spawnSync } from "node:child_process";
import { installDependencies, paths, runPackageScript, runPnpm } from "./validation/run.js";

installDependencies(paths.errorsRoot);
runPackageScript("typecheck", paths.errorsRoot);
runPackageScript("test", paths.errorsRoot);
runPackageScript("build", paths.errorsRoot);

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
