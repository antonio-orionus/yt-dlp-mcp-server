import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  CONFIG,
  DownloadInputSchema,
  ensureDirectory,
  ensureWithinRoot,
  findOptionByFlag,
  optionMetadata,
  parseFinalPaths,
  parseProgress,
  planDownload,
  readArchive,
  redactArgs,
  runCommand,
  ytdlpCommand
} from "yt-dlp-bridge";
import { z } from "zod";
import { ok } from "./tooling.js";

export async function executeDownload(input: z.infer<typeof DownloadInputSchema>): Promise<CallToolResult> {
  const plan = await planDownload(input, CONFIG);
  if (input.dryRun) return ok({ dryRun: true, plan });

  await ensureDirectory(plan.outputRoot);
  await ensureDirectory(plan.tempRoot);
  const startedAt = Date.now();
  const result = await runYtdlp(plan.argv);
  const finalPaths = parseFinalPaths(result.stdout);
  if (finalPaths.paths.length === 0) {
    finalPaths.paths = await listRecentlyWrittenFiles(plan.outputRoot, startedAt, plan.outputTemplate);
  }
  return ok({
    plan,
    command: result.command,
    argv: result.args,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    finalPaths,
    progress: parseProgress(`${result.stdout}\n${result.stderr}`)
  });
}

export async function runReadOnly(args: string[]): Promise<CallToolResult> {
  const result = await runYtdlp(args);
  return ok({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, durationMs: result.durationMs });
}

export async function runYtdlp(args: string[]) {
  const command = ytdlpCommand(args, CONFIG);
  return runCommand(command.command, command.args, {
    timeoutMs: CONFIG.defaultTimeoutMs,
    maxOutputBytes: CONFIG.maxOutputBytes
  });
}

export function validateExpertArgs(args: string[]): { valid: boolean; blocked: string[] } {
  const blocked: string[] = [];
  for (const arg of args) {
    if (!arg.startsWith("-")) continue;
    const flag = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    const option = findOptionByFlag(flag);
    if (!option) {
      blocked.push(`${flag}: unknown option`);
      continue;
    }
    const metadata = optionMetadata(option);
    if (metadata.policy === "blocked-in-expert") blocked.push(`${flag}: blocked by policy`);
    if (metadata.policy === "path-gated" && !CONFIG.allowArbitraryOutputPaths) blocked.push(`${flag}: path-gated by server policy`);
  }
  return { valid: blocked.length === 0, blocked };
}

export function readArchiveSafe(archivePath: string): string[] {
  if (!CONFIG.allowArbitraryOutputPaths) ensureWithinRoot(CONFIG.outputRoot, archivePath, "archivePath");
  return readArchive(archivePath);
}

async function listRecentlyWrittenFiles(root: string, sinceMs: number, outputTemplate: string): Promise<string[]> {
  const files: string[] = [];
  const matchesTemplate = createOutputTemplateMatcher(outputTemplate);
  await collectRecentlyWrittenFiles(root, sinceMs, files, matchesTemplate, 0);
  return files.sort();
}

async function collectRecentlyWrittenFiles(dir: string, sinceMs: number, files: string[], matchesTemplate: (fileName: string) => boolean, depth: number): Promise<void> {
  if (depth > 4) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectRecentlyWrittenFiles(fullPath, sinceMs, files, matchesTemplate, depth + 1);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!matchesTemplate(entry.name)) continue;
    try {
      const info = await stat(fullPath);
      if (info.mtimeMs >= sinceMs) files.push(fullPath);
    } catch {
      // Ignore files that disappear while the directory is scanned.
    }
  }
}

function createOutputTemplateMatcher(outputTemplate: string): (fileName: string) => boolean {
  const baseTemplate = outputTemplate.split(/[\\/]/).at(-1) ?? outputTemplate;
  const firstPlaceholder = baseTemplate.indexOf("%(");
  const literalPrefix = firstPlaceholder > 0 ? baseTemplate.slice(0, firstPlaceholder) : "";
  return (fileName) => !literalPrefix || fileName.startsWith(literalPrefix);
}
