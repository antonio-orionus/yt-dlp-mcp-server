import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assert, callTool, defaultTestUrl, isRecord, resetDirectory, scriptSummary, textBytes, validationRoot, withMcpClient } from "./validation/common.js";

type Finding = {
  severity: "high" | "medium" | "low";
  tool: string;
  issue: string;
  evidence?: unknown;
};

type AuditCall = {
  name: string;
  args: Record<string, unknown>;
  maxTextBytes?: number;
};

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const hostOutputRoot = path.join(validationRoot, `audit-${runId}`);
const dockerImage = process.env.YTDLP_MCP_AUDIT_DOCKER_IMAGE;
const serverOutputRoot = dockerImage ? "/downloads" : hostOutputRoot;
const archivePath = path.join(serverOutputRoot, "archive.txt");
const outputsPath = path.join(hostOutputRoot, "outputs.json");
const findingsPath = path.join(hostOutputRoot, "findings.json");
const url = process.env.YTDLP_MCP_AUDIT_URL ?? defaultTestUrl;

const calls: AuditCall[] = [
  { name: "ytdlp_check_environment", args: {}, maxTextBytes: 20_000 },
  { name: "ytdlp_list_extractors", args: {}, maxTextBytes: 80_000 },
  { name: "ytdlp_list_impersonation_targets", args: {}, maxTextBytes: 10_000 },
  { name: "ytdlp_search_videos", args: { query: "yt-dlp test video", limit: 5 }, maxTextBytes: 30_000 },
  { name: "ytdlp_get_metadata", args: { url, limit: 1 }, maxTextBytes: 80_000 },
  { name: "ytdlp_probe_url", args: { url, limit: 1 }, maxTextBytes: 80_000 },
  { name: "ytdlp_list_formats", args: { url, limit: 50 }, maxTextBytes: 50_000 },
  { name: "ytdlp_list_subtitles", args: { url, limit: 50 }, maxTextBytes: 50_000 },
  { name: "ytdlp_list_thumbnails", args: { url, limit: 50 }, maxTextBytes: 50_000 },
  { name: "ytdlp_plan_download", args: { url, kind: "video" }, maxTextBytes: 20_000 },
  { name: "ytdlp_plan_postprocess", args: { url, postprocess: { extractAudio: true, audioFormat: "mp3" } }, maxTextBytes: 20_000 },
  { name: "ytdlp_validate_options", args: {}, maxTextBytes: 100_000 },
  { name: "ytdlp_inspect_archive", args: { archivePath }, maxTextBytes: 10_000 },
  { name: "ytdlp_check_archive", args: { archivePath, entry: "youtube audit-id" }, maxTextBytes: 10_000 },
  { name: "ytdlp_update_archive", args: { archivePath, entry: "youtube audit-id" }, maxTextBytes: 10_000 },
  { name: "ytdlp_execute_expert", args: { args: ["--version"] }, maxTextBytes: 10_000 }
];

const dryRunTools = [
  "ytdlp_download_video",
  "ytdlp_download_audio",
  "ytdlp_download_subtitles",
  "ytdlp_download_thumbnail",
  "ytdlp_download_playlist",
  "ytdlp_remux",
  "ytdlp_recode",
  "ytdlp_extract_audio",
  "ytdlp_embed_assets",
  "ytdlp_split_chapters",
  "ytdlp_remove_chapters",
  "ytdlp_apply_sponsorblock"
];

for (const tool of dryRunTools) {
  calls.push({
    name: tool,
    args: {
      url,
      dryRun: true,
      output: { outputRoot: serverOutputRoot, outputTemplate: `${tool}.%(ext)s`, allowOverwrite: true },
      download: { downloadSections: ["*00:00:00-00:00:01"] },
      subtitles: { writeAutoSubs: true, subFormat: "vtt", subLangs: "en" },
      thumbnails: { writeThumbnail: true },
      postprocess: { audioFormat: "mp3" }
    },
    maxTextBytes: 40_000
  });
}

await resetDirectory(hostOutputRoot);
await mkdir(hostOutputRoot, { recursive: true });
await writeFile(path.join(hostOutputRoot, "archive.txt"), "youtube audit-id\n", "utf8");

const records: Array<{ name: string; args: Record<string, unknown>; result: unknown; textBytes: number }> = [];
const findings: Finding[] = [];

await withMcpClient(
  dockerImage
    ? {
        outputRoot: serverOutputRoot,
        command: "docker",
        args: [
          "run",
          "--rm",
          "-i",
          "-v",
          `${hostOutputRoot}:${serverOutputRoot}`,
          "-e",
          `YTDLP_MCP_OUTPUT_ROOT=${serverOutputRoot}`,
          "-e",
          "YTDLP_MCP_TEMP_ROOT=/tmp/yt-dlp-mcp",
          dockerImage
        ],
        name: "yt-dlp-mcp-output-audit-docker"
      }
    : { outputRoot: serverOutputRoot, name: "yt-dlp-mcp-output-audit" },
  async (client) => {
  for (const call of calls) {
    const result = await callTool(client, call.name, call.args);
    const size = textBytes(result);
    records.push({ name: call.name, args: call.args, result, textBytes: size });

    if (!isRecord(result.structuredContent)) {
      findings.push({ severity: "high", tool: call.name, issue: "missing structuredContent" });
      continue;
    }

    if (call.maxTextBytes && size > call.maxTextBytes) {
      findings.push({ severity: "medium", tool: call.name, issue: "response text is too large", evidence: { textBytes: size, maxTextBytes: call.maxTextBytes } });
    }

    inspectPayload(call.name, result.structuredContent, findings);
  }
  }
);

await writeFile(outputsPath, JSON.stringify({ runId, outputRoot: hostOutputRoot, serverOutputRoot, dockerImage, records }, null, 2));
await writeFile(findingsPath, JSON.stringify({ runId, outputRoot: hostOutputRoot, serverOutputRoot, dockerImage, findings }, null, 2));

const blockers = findings.filter((finding) => finding.severity === "high" || finding.severity === "medium");
scriptSummary("audit-outputs", { ok: blockers.length === 0, docker: Boolean(dockerImage), records: records.length, findings: findings.length, outputsPath, findingsPath });

if (blockers.length > 0) {
  for (const finding of blockers) {
    console.error(`${finding.severity.toUpperCase()} ${finding.tool}: ${finding.issue}${finding.evidence ? ` ${JSON.stringify(finding.evidence)}` : ""}`);
  }
  process.exit(1);
}

function inspectPayload(tool: string, payload: unknown, findings: Finding[], pathParts: string[] = ["$"]): void {
  if (typeof payload === "string") {
    inspectString(tool, payload, findings, pathParts.join("."));
    return;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item, index) => inspectPayload(tool, item, findings, [...pathParts, String(index)]));
    return;
  }
  if (!isRecord(payload)) return;

  for (const [key, value] of Object.entries(payload)) {
    const currentPath = [...pathParts, key];
    if (isUnsafeKey(key, currentPath)) {
      findings.push({ severity: "high", tool, issue: "unsafe raw yt-dlp field in output", evidence: { path: currentPath.join("."), key } });
    }
    inspectPayload(tool, value, findings, currentPath);
  }
}

function inspectString(tool: string, value: string, findings: Finding[], pathName: string): void {
  if (/googlevideo\.com\/videoplayback|manifest\.googlevideo\.com/i.test(value)) {
    findings.push({ severity: "high", tool, issue: "signed/direct media URL leaked", evidence: { path: pathName, sample: value.slice(0, 160) } });
  }
  if (/[?&](?:sig|lsig|signature|expire|x-goog-signature|x-goog-credential)=/i.test(value)) {
    findings.push({ severity: "high", tool, issue: "signed URL query leaked", evidence: { path: pathName, sample: value.slice(0, 160) } });
  }
  if (/(?:Authorization|Cookie):\s*\S+/i.test(value)) {
    findings.push({ severity: "high", tool, issue: "auth header leaked", evidence: { path: pathName } });
  }
}

function isUnsafeKey(key: string, pathParts: string[]): boolean {
  if (["http_headers", "httpHeaders", "fragments", "requested_formats", "requestedFormats"].includes(key)) return true;
  if (key !== "url") return false;
  const pathName = pathParts.join(".");
  return /\.formats\.\d+\.url$|\.requested_formats\.\d+\.url$|\.requestedFormats\.\d+\.url$/i.test(pathName);
}
