import { readFile } from "node:fs/promises";
import path from "node:path";
import { assert, repoRoot, scriptSummary } from "./validation/common.js";
import { buildDockerImage, installDependencies, packDryRun, paths, run, runPackageScript, runPnpm } from "./validation/run.js";

const image = process.env.YTDLP_MCP_DOCKER_IMAGE ?? "yt-dlp-mcp-server:validation";

installDependencies(paths.errorsRoot);
runPackageScript("typecheck", paths.errorsRoot);
runPackageScript("test", paths.errorsRoot);
runPackageScript("build", paths.errorsRoot);

runPnpm(["install", "--frozen-lockfile"], paths.bridgeRoot);
runPnpm(["run", "typecheck"], paths.bridgeRoot);
runPnpm(["run", "test"], paths.bridgeRoot);
runPnpm(["run", "build"], paths.bridgeRoot);

runPnpm(["install", "--frozen-lockfile"]);
runPnpm(["run", "typecheck"]);
runPnpm(["run", "typecheck:scripts"]);
runPnpm(["run", "test"]);
runPnpm(["run", "build"]);
runPnpm(["run", "test:mcp-contract"]);

packDryRun(paths.errorsRoot);
runPnpm(["pack", "--dry-run"], paths.bridgeRoot);
runPnpm(["pack", "--dry-run"], paths.repoRoot);

await checkReleaseMetadata();

buildDockerImage(image);
runDockerBridgeVerify(image);
runPnpm(["exec", "tsx", "scripts/audit-outputs.ts"], paths.repoRoot, { YTDLP_MCP_AUDIT_DOCKER_IMAGE: image });
runPnpm(["run", "smoke:docker"], paths.repoRoot, { YTDLP_MCP_DOCKER_IMAGE: image });

scriptSummary("validate-release", { ok: true, image });

async function checkReleaseMetadata(): Promise<void> {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as Record<string, unknown>;
  const serverJson = JSON.parse(await readFile(path.join(repoRoot, "server.json"), "utf8")) as Record<string, unknown>;
  const dockerfile = await readFile(path.join(repoRoot, "Dockerfile"), "utf8");
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");

  assert(packageJson.name === "yt-dlp-mcp-server", "package.json name mismatch");
  assert(packageJson.mcpName === "io.github.antonio-orionus/yt-dlp", "package.json mcpName mismatch");
  assert(serverJson.name === "io.github.antonio-orionus/yt-dlp", "server.json name mismatch");
  assert(dockerfile.includes('io.modelcontextprotocol.server.name="io.github.antonio-orionus/yt-dlp"'), "Dockerfile missing MCP OCI label");
  assert(readme.includes("MCP server pre-release"), "README must keep pre-release warning until release decision");
  assert(readme.includes("MCP Inspector"), "README missing MCP Inspector docs/checklist");
}

function runDockerBridgeVerify(imageName: string): void {
  run("docker", [
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    "-v",
    `${paths.bridgeRoot}:/work:ro`,
    imageName,
    "-lc",
    "cd /work && node scripts/verify-ytdlp-option-catalog.mjs"
  ]);
}
