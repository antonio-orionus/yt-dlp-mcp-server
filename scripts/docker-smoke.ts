import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { assert, assertFile, callOk, defaultTestUrl, isRecord, resetDirectory, scriptSummary, validationRoot, withMcpClient } from "./validation/common.js";

const image = process.env.YTDLP_MCP_DOCKER_IMAGE ?? "yt-dlp-mcp-server:validation";
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const hostOutputRoot = path.join(validationRoot, `docker-smoke-${runId}`);
const containerOutputRoot = "/downloads";
const archivePath = `${containerOutputRoot}/archive.txt`;
const url = process.env.YTDLP_MCP_DOCKER_SMOKE_URL ?? defaultTestUrl;

await resetDirectory(hostOutputRoot);
await mkdir(hostOutputRoot, { recursive: true });

await withMcpClient(
  {
    outputRoot: containerOutputRoot,
    command: "docker",
    args: [
      "run",
      "--rm",
      "-i",
      "-v",
      `${hostOutputRoot}:${containerOutputRoot}`,
      "-e",
      `YTDLP_MCP_OUTPUT_ROOT=${containerOutputRoot}`,
      "-e",
      "YTDLP_MCP_TEMP_ROOT=/tmp/yt-dlp-mcp",
      image
    ],
    name: "yt-dlp-mcp-docker-smoke"
  },
  async (client) => {
    const environment = await callOk(client, "ytdlp_check_environment");
    assertDependency(environment, "yt-dlp");
    assertDependency(environment, "ffmpeg");
    assertDependency(environment, "ffprobe");
    assertDependency(environment, "deno");

    await callOk(client, "ytdlp_search_videos", { query: "yt-dlp test video", limit: 3 });
    await callOk(client, "ytdlp_get_metadata", { url, limit: 1 });
    await callOk(client, "ytdlp_list_formats", { url, limit: 10 });
    await callOk(client, "ytdlp_plan_download", {
      url,
      output: { outputRoot: containerOutputRoot, outputTemplate: "planned.%(ext)s", allowOverwrite: true },
      download: { downloadSections: ["*00:00:00-00:00:01"] }
    });

    const video = await callOk(client, "ytdlp_download_video", {
      url,
      output: { outputRoot: containerOutputRoot, outputTemplate: "docker-video.%(ext)s", allowOverwrite: true },
      download: { downloadSections: ["*00:00:00-00:00:01"] },
      format: { format: "worstvideo[ext=mp4]+worstaudio[ext=m4a]/worst[ext=mp4]/worst" }
    });
    await assertContainerFinalPaths(video, hostOutputRoot, "docker-video.");

    const audio = await callOk(client, "ytdlp_extract_audio", {
      url,
      output: { outputRoot: containerOutputRoot, outputTemplate: "docker-audio.%(ext)s", allowOverwrite: true },
      download: { downloadSections: ["*00:00:00-00:00:01"] },
      postprocess: { extractAudio: true, audioFormat: "mp3" }
    });
    await assertContainerFinalPaths(audio, hostOutputRoot, "docker-audio.");

    const thumbnail = await callOk(client, "ytdlp_download_thumbnail", {
      url,
      output: { outputRoot: containerOutputRoot, outputTemplate: "docker-thumbnail.%(ext)s", allowOverwrite: true },
      thumbnails: { writeThumbnail: true }
    });
    await assertContainerFinalPaths(thumbnail, hostOutputRoot, "docker-thumbnail.");

    const playlist = await callOk(client, "ytdlp_download_playlist", {
      url,
      output: { outputRoot: containerOutputRoot, outputTemplate: "docker-playlist.%(ext)s", allowOverwrite: true },
      download: { downloadSections: ["*00:00:00-00:00:01"] },
      selection: { playlistItems: "1", downloadArchive: archivePath },
      format: { format: "worstvideo[ext=mp4]+worstaudio[ext=m4a]/worst[ext=mp4]/worst" }
    });
    await assertContainerFinalPaths(playlist, hostOutputRoot, "docker-playlist.");

    const archive = await readFile(path.join(hostOutputRoot, "archive.txt"), "utf8");
    assert(archive.split(/\r?\n/).filter(Boolean).length > 0, "docker archive was not updated");
  }
);

scriptSummary("docker-smoke", { ok: true, image, hostOutputRoot });

function assertDependency(environment: Record<string, unknown>, dependencyName: string): void {
  const dependencies = Array.isArray(environment.dependencies) ? environment.dependencies : [];
  const dependency = dependencies.find((item) => isRecord(item) && item.name === dependencyName);
  assert(isRecord(dependency), `environment missing ${dependencyName}`);
  assert(dependency.status === "available", `${dependencyName} is not available in Docker image`);
}

async function assertContainerFinalPaths(data: Record<string, unknown>, hostRoot: string, expectedPrefix: string): Promise<void> {
  assert(isRecord(data.finalPaths), "missing finalPaths");
  const paths = Array.isArray(data.finalPaths.paths) ? data.finalPaths.paths : [];
  assert(paths.length > 0, "expected container final paths");
  for (const containerPath of paths) {
    assert(typeof containerPath === "string", "container final path is not a string");
    if (!containerPath.startsWith(`${containerOutputRoot}/`)) continue;
    assert(path.basename(containerPath).startsWith(expectedPrefix), `unexpected container final path ${containerPath}`);
    const hostPath = path.join(hostRoot, path.relative(containerOutputRoot, containerPath));
    await assertFile(hostPath, hostRoot);
  }
}
