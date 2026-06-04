import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdir, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const validationRoot = path.join(repoRoot, ".tmp-validation");
export const defaultTestUrl = process.env.YTDLP_MCP_TEST_URL ?? "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

export type JsonRecord = Record<string, unknown>;
export type ToolResult = {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function resetDirectory(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
}

export function safeEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    ...overrides
  };
}

export async function withMcpClient<T>(
  options: {
    outputRoot: string;
    command?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    name?: string;
  },
  callback: (client: Client) => Promise<T>
): Promise<T> {
  const client = new Client({ name: options.name ?? "yt-dlp-mcp-validation", version: "0.0.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: options.command ?? process.execPath,
    args: options.args ?? [path.join(repoRoot, "dist/index.js")],
    cwd: options.cwd ?? repoRoot,
    env: safeEnv({
      YTDLP_MCP_OUTPUT_ROOT: options.outputRoot,
      YTDLP_MCP_TEMP_ROOT: path.join(validationRoot, "tmp"),
      YTDLP_MCP_TIMEOUT_MS: process.env.YTDLP_MCP_TIMEOUT_MS ?? "120000",
      ...options.env
    }),
    stderr: "pipe"
  });

  try {
    await client.connect(transport);
    return await callback(client);
  } finally {
    await client.close();
  }
}

export async function callTool(client: Client, name: string, args: JsonRecord = {}): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

export async function callOk(client: Client, name: string, args: JsonRecord = {}): Promise<JsonRecord> {
  const result = await callTool(client, name, args);
  const structured = result.structuredContent as { ok?: boolean; data?: unknown; error?: unknown } | undefined;
  assert(structured, `${name}: missing structuredContent`);
  assert(structured.ok === true, `${name}: expected ok=true, got ${JSON.stringify(structured.error ?? structured)}`);
  assert(isRecord(structured.data), `${name}: expected object data`);
  return structured.data;
}

export function textBytes(result: ToolResult): number {
  return (result.content ?? []).reduce((total, item) => total + (item.text?.length ?? 0), 0);
}

export async function assertFile(pathname: string, root: string): Promise<number> {
  assert(isInside(root, pathname), `file is outside output root: ${pathname}`);
  const info = await stat(pathname);
  assert(info.isFile(), `not a file: ${pathname}`);
  assert(info.size > 0, `empty file: ${pathname}`);
  return info.size;
}

export function assertFfprobe(pathname: string): void {
  const result = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=format_name,duration,size", "-of", "json", pathname], {
    encoding: "utf8"
  });
  assert(result.status === 0, `ffprobe failed for ${pathname}: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout) as { format?: { duration?: string; size?: string } };
  assert(Number(parsed.format?.duration ?? 0) > 0, `ffprobe reported no duration for ${pathname}`);
  assert(Number(parsed.format?.size ?? 0) > 0, `ffprobe reported no size for ${pathname}`);
}

export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function scriptSummary(name: string, details: JsonRecord): void {
  console.log(JSON.stringify({ script: name, ...details }, null, 2));
}
