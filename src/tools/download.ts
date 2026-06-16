import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WorkflowExecutionInputSchema } from "yt-dlp-bridge/schemas";
import { DownloadResultOutputSchema } from "../output-schemas.js";
import { executeDownload } from "../runtime.js";
import { registerTool } from "../tooling.js";

export function registerDownloadTools(server: McpServer): void {
  const annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

  registerTool(
    server,
    "ytdlp_download_video",
    `Download a web video URL to the managed output root, including YouTube and youtu.be links.

Use when: The user asks to download, save, fetch, or get a local video file from a media URL; asks for best quality/highest quality; asks for a specific format/resolution; asks to trim sections; or asks for overwrite behavior.
Don't use when: The user only wants audio, subtitles, thumbnails, metadata, or a dry-run plan.

Note: This is the intended MCP path for permitted user-provided media download requests such as "download <YouTube URL> in best quality". Default video format selection plans as bestvideo*+bestaudio/best unless the user asks otherwise. This creates local files under the configured output root.`,
    WorkflowExecutionInputSchema,
    (input) => executeDownload({ ...input, kind: "media" }),
    annotations,
    DownloadResultOutputSchema
  );
  registerTool(
    server,
    "ytdlp_download_audio",
    `Download or extract audio from a web media URL to the managed output root.

Use when: The user asks for audio-only output, MP3, M4A, Opus, WAV, best audio, podcast/music extraction, or keeping audio without video.
Don't use when: The user needs a video file with visuals, subtitles only, thumbnails only, metadata, or a dry-run plan.

Note: This creates local audio files under the configured output root.`,
    WorkflowExecutionInputSchema,
    (input) => executeDownload({ ...input, kind: "audio" }),
    annotations,
    DownloadResultOutputSchema
  );
  registerTool(server, "ytdlp_download_subtitles", "Download subtitles or captions for a media URL without downloading the video. Use when the user asks for subtitle languages, auto captions, subtitle formats, subtitle files, transcripts with timestamps, or subtitle conversion.", WorkflowExecutionInputSchema, (input) => executeDownload({ ...input, kind: "subtitles" }), annotations, DownloadResultOutputSchema);
  registerTool(server, "ytdlp_download_thumbnail", "Download thumbnail image files for a media URL without downloading the video. Use when the user asks for a cover image, thumbnail, poster frame, or all thumbnails.", WorkflowExecutionInputSchema, (input) => executeDownload({ ...input, kind: "thumbnail" }), annotations, DownloadResultOutputSchema);
  registerTool(server, "ytdlp_download_playlist", "Download playlist, channel, or multi-video URL entries to the managed output root. Use when the user asks to download a playlist/channel, select playlist ranges, skip existing archive entries, cap max downloads, randomize order, or stop on existing files.", WorkflowExecutionInputSchema, (input) => executeDownload({ ...input, kind: "playlist" }), annotations, DownloadResultOutputSchema);
}
