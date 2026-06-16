import { scriptSummary } from "./validation/common.js";
import { runPnpm } from "./validation/run.js";

runPnpm(["install", "--frozen-lockfile"]);
runPnpm(["run", "typecheck"]);
runPnpm(["run", "typecheck:scripts"]);
runPnpm(["run", "test"]);
runPnpm(["run", "build"]);
runPnpm(["run", "test:mcp-contract"]);
runPnpm(["run", "audit:outputs"]);
runPnpm(["run", "smoke:real"]);

scriptSummary("validate-local", { ok: true });
