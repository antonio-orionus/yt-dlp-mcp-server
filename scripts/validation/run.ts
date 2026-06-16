import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./common.js";

export const paths = {
  repoRoot
};

export function command(name: string): string {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

const noisyPackageManagerEnv = new Set([
  "npm_config__jsr_registry",
  "npm_config_npm_globalconfig",
  "npm_config_verify_deps_before_run"
]);

export function run(commandName: string, args: string[], options: { cwd?: string; env?: Record<string, string> } = {}): void {
  console.log(`\n$ ${commandName} ${args.join(" ")}${options.cwd ? `  # cwd=${options.cwd}` : ""}`);
  const result = spawnSync(commandName, args, {
    cwd: options.cwd ?? repoRoot,
    env: childEnv(options.env),
    stdio: "inherit",
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${String(result.status)}: ${commandName} ${args.join(" ")}`);
  }
}

export function runPnpm(args: string[], cwd = repoRoot, env: Record<string, string> = {}): void {
  run(command("pnpm"), args, { cwd, env });
}

export function runNpm(args: string[], cwd = repoRoot, env: Record<string, string> = {}): void {
  run(command("npm"), args, { cwd, env });
}

export function installDependencies(cwd = repoRoot): void {
  if (existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
    runPnpm(["install", "--frozen-lockfile"], cwd);
    return;
  }
  if (existsSync(path.join(cwd, "package-lock.json"))) {
    runNpm(["ci"], cwd);
    return;
  }
  runPnpm(["install", "--no-frozen-lockfile"], cwd);
}

export function runPackageScript(script: string, cwd = repoRoot): void {
  if (existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
    runPnpm(["run", script], cwd);
    return;
  }
  runNpm(["run", script], cwd);
}

export function packDryRun(cwd = repoRoot): void {
  if (existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
    runPnpm(["pack", "--dry-run"], cwd);
    return;
  }
  runNpm(["pack", "--dry-run"], cwd);
}

export function buildDockerImage(image: string): void {
  run("docker", [
    "buildx",
    "build",
    "--load",
    "-t",
    image,
    paths.repoRoot
  ]);
}

function childEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (noisyPackageManagerEnv.has(key.toLowerCase())) delete env[key];
  }
  return { ...env, ...overrides };
}
