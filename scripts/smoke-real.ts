import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { assert, assertFfprobe, assertFile, callOk, defaultTestUrl, isInside, isRecord, repoRoot, resetDirectory, scriptSummary, validationRoot, withMcpClient } from "./validation/common.js";

type SmokeCase = {
  tool: string;
  args: Record<string, unknown>;
  expectedPrefix: string;
  expectFinalPaths: boolean;
  ffprobe?: boolean;
};

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = path.join(validationRoot, `smoke-${runId}`);
const archivePath = path.join(outputRoot, "archive.txt");
const url = process.env.YTDLP_MCP_SMOKE_URL ?? defaultTestUrl;
const mediaSection = ["*00:00:00-00:00:01"];

await resetDirectory(outputRoot);
await mkdir(outputRoot, { recursive: true });

const cases: SmokeCase[] = [
  {
    tool: "ytdlp_download_video",
    args: mediaArgs("video-section.%(ext)s"),
    expectedPrefix: "video-section.",
    expectFinalPaths: true,
    ffprobe: true
  },
  {
    tool: "ytdlp_download_audio",
    args: mediaArgs("audio-section.%(ext)s", { postprocess: { extractAudio: true, audioFormat: "mp3" } }),
    expectedPrefix: "audio-section.",
    expectFinalPaths: true,
    ffprobe: true
  },
  {
    tool: "ytdlp_download_subtitles",
    args: assetArgs("subs.%(ext)s", { subtitles: { writeAutoSubs: true, subFormat: "vtt", subLangs: "en" } }),
    expectedPrefix: "subs.",
    expectFinalPaths: true
  },
  {
    tool: "ytdlp_download_thumbnail",
    args: assetArgs("thumbnail.%(ext)s", { thumbnails: { writeThumbnail: true } }),
    expectedPrefix: "thumbnail.",
    expectFinalPaths: true
  },
  {
    tool: "ytdlp_download_playlist",
    args: mediaArgs("playlist-section.%(ext)s", { selection: { playlistItems: "1", downloadArchive: archivePath } }),
    expectedPrefix: "playlist-section.",
    expectFinalPaths: true,
    ffprobe: true
  },
  {
    tool: "ytdlp_remux",
    args: mediaArgs("remux-section.%(ext)s", { postprocess: { remuxVideo: "mkv" } }),
    expectedPrefix: "remux-section.",
    expectFinalPaths: true,
    ffprobe: true
  },
  {
    tool: "ytdlp_recode",
    args: mediaArgs("recode-section.%(ext)s", { postprocess: { recodeVideo: "webm" } }),
    expectedPrefix: "recode-section.",
    expectFinalPaths: true,
    ffprobe: true
  },
  {
    tool: "ytdlp_extract_audio",
    args: mediaArgs("extract-audio-section.%(ext)s", { postprocess: { extractAudio: true, audioFormat: "mp3" } }),
    expectedPrefix: "extract-audio-section.",
    expectFinalPaths: true,
    ffprobe: true
  },
  {
    tool: "ytdlp_embed_assets",
    args: mediaArgs("embed-assets-section.%(ext)s", { postprocess: { embedMetadata: true, embedThumbnail: true } }),
    expectedPrefix: "embed-assets-section.",
    expectFinalPaths: true,
    ffprobe: true
  },
  {
    tool: "ytdlp_split_chapters",
    args: mediaArgs("split-chapters-section.%(ext)s", { postprocess: { splitChapters: true } }),
    expectedPrefix: "split-chapters-section.",
    expectFinalPaths: true,
    ffprobe: true
  },
  {
    tool: "ytdlp_remove_chapters",
    args: mediaArgs("remove-chapters-section.%(ext)s", { postprocess: { removeChapters: [".*sponsor.*"] } }),
    expectedPrefix: "remove-chapters-section.",
    expectFinalPaths: true,
    ffprobe: true
  },
  {
    tool: "ytdlp_apply_sponsorblock",
    args: mediaArgs("sponsorblock-section.%(ext)s", { sponsorblock: { mark: "default" } }),
    expectedPrefix: "sponsorblock-section.",
    expectFinalPaths: true,
    ffprobe: true
  }
];

const artifacts: Array<{ tool: string; path: string; size: number }> = [];

await withMcpClient({ outputRoot, name: "yt-dlp-mcp-real-smoke" }, async (client) => {
  const environment = await callOk(client, "ytdlp_check_environment");
  assertDependency(environment, "yt-dlp");

  await callOk(client, "ytdlp_search_videos", { query: "yt-dlp test video", limit: 3 });
  await callOk(client, "ytdlp_get_metadata", { url, limit: 1 });
  await callOk(client, "ytdlp_list_formats", { url, limit: 10 });
  await callOk(client, "ytdlp_list_subtitles", { url, limit: 10 });
  await callOk(client, "ytdlp_list_thumbnails", { url, limit: 10 });
  await callOk(client, "ytdlp_probe_url", { url, limit: 1 });

  const plan = await callOk(client, "ytdlp_plan_download", mediaArgs("planned.%(ext)s"));
  assert(isRecord(plan.facts), "plan missing facts");
  assert(isRecord(plan.facts.dependencies), "plan missing dependency facts");
  assert(Array.isArray(plan.facts.dependencies.required), "plan missing required dependency facts");

  for (const smokeCase of cases) {
    const data = await callOk(client, smokeCase.tool, smokeCase.args);
    assert(data.exitCode === 0, `${smokeCase.tool}: exitCode=${String(data.exitCode)}`);
    assert(isRecord(data.finalPaths), `${smokeCase.tool}: missing finalPaths`);
    const finalPaths = Array.isArray(data.finalPaths.paths) ? data.finalPaths.paths : [];
    if (smokeCase.expectFinalPaths) assert(finalPaths.length > 0, `${smokeCase.tool}: expected final paths`);

    for (const finalPath of finalPaths) {
      assert(typeof finalPath === "string", `${smokeCase.tool}: final path is not a string`);
      if (!isInside(outputRoot, finalPath)) continue;
      assert(path.basename(finalPath).startsWith(smokeCase.expectedPrefix), `${smokeCase.tool}: unexpected final path ${finalPath}`);
      const size = await assertFile(finalPath, outputRoot);
      if (smokeCase.ffprobe) assertFfprobe(finalPath);
      artifacts.push({ tool: smokeCase.tool, path: finalPath, size });
    }
  }

  const archive = await readFile(archivePath, "utf8");
  const archiveEntries = archive.split(/\r?\n/).filter(Boolean);
  assert(archiveEntries.length > 0, "download archive was not updated by yt-dlp");
  const inspected = await callOk(client, "ytdlp_inspect_archive", { archivePath });
  assert(Number(inspected.count) > 0, "archive inspect did not see entries");
  const checked = await callOk(client, "ytdlp_check_archive", { archivePath, entry: archiveEntries[0] });
  assert(checked.exists === true, "archive check did not find the first archive entry");

  const expert = await callOk(client, "ytdlp_execute_expert", { args: ["--version"] });
  assert(expert.allowed === false, "expert mode must be disabled in real smoke");
});

scriptSummary("smoke-real", { ok: true, url, outputRoot, artifacts });

function mediaArgs(outputTemplate: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return mergeInput(
    {
      url,
      output: { outputRoot, outputTemplate, allowOverwrite: true },
      download: { downloadSections: mediaSection },
      format: { format: "worstvideo[ext=mp4]+worstaudio[ext=m4a]/worst[ext=mp4]/worst" }
    },
    extra
  );
}

function assetArgs(outputTemplate: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return mergeInput(
    {
      url,
      output: { outputRoot, outputTemplate, allowOverwrite: true }
    },
    extra
  );
}

function mergeInput(base: Record<string, unknown>, extra: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (isRecord(value) && isRecord(merged[key])) {
      merged[key] = { ...(merged[key] as Record<string, unknown>), ...value };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function assertDependency(environment: Record<string, unknown>, dependencyName: string): void {
  const dependencies = Array.isArray(environment.dependencies) ? environment.dependencies : [];
  const dependency = dependencies.find((item) => isRecord(item) && item.name === dependencyName);
  assert(isRecord(dependency), `environment missing ${dependencyName}`);
  assert(dependency.status === "available", `${dependencyName} is not available; smoke tests require host dependencies`);
}
