import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { planWorkflow, type WorkflowPlan } from "yt-dlp-bridge";
import { CONFIG } from "yt-dlp-bridge/config";
import { ensureDirectory, ensureWithinRoot, readArchive } from "yt-dlp-bridge/filesystem";
import { findOptionByFlag, optionMetadata } from "yt-dlp-bridge/option-catalog";
import { parseFinalPaths, parseProgress } from "yt-dlp-bridge/parsers";
import { redactArgs } from "yt-dlp-bridge/redaction";
import { runCommand } from "yt-dlp-bridge/runner";
import { WorkflowExecutionInputSchema } from "yt-dlp-bridge/schemas";
import { z } from "zod";
import { ok } from "./tooling.js";

export async function executeDownload(input: z.infer<typeof WorkflowExecutionInputSchema>): Promise<CallToolResult> {
  const plan = planWorkflow(input, { config: CONFIG, configFiles: { mode: "disabled" } });
  if (input.dryRun) return ok({ dryRun: true, plan });

  await ensurePlanOutputDirectories(plan);
  const startedAt = Date.now();
  const result = await runYtdlp(plan.args);
  const finalPaths = parseFinalPaths(result.stdout);
  if (finalPaths.paths.length === 0) {
    finalPaths.paths = await listRecentlyWrittenFiles(planOutputRoot(plan), startedAt, planOutputTemplate(plan));
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
  return runCommand(CONFIG.ytdlpPath, args, {
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

function planOutputRoot(plan: WorkflowPlan): string {
  const root = plan.facts.output?.outputRoot;
  if (!root) throw new Error("Workflow plan does not include a managed output root");
  return root;
}

function planOutputTemplate(plan: WorkflowPlan): string {
  const template = plan.facts.output?.template;
  if (!template) throw new Error("Workflow plan does not include an output template");
  return template;
}

async function ensurePlanOutputDirectories(plan: WorkflowPlan): Promise<void> {
  await ensureDirectory(planOutputRoot(plan));
  const tempRoot = plan.facts.output?.tempRoot;
  if (tempRoot) await ensureDirectory(tempRoot);
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
