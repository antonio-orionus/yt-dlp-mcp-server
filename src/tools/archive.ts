import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ArchivePathInputSchema } from "yt-dlp-bridge";
import { ArchiveCheckOutputSchema, ArchiveInspectOutputSchema, ArchiveUpdateOutputSchema } from "../output-schemas.js";
import { readArchiveSafe } from "../runtime.js";
import { ok, registerTool } from "../tooling.js";

export function registerArchiveTools(server: McpServer): void {
  registerTool(
    server,
    "ytdlp_inspect_archive",
    "Read a yt-dlp download archive file under the configured filesystem policy and return its saved archive entries. Use when the user asks what is already in an archive.",
    ArchivePathInputSchema,
    async (input) => {
      const entries = readArchiveSafe(input.archivePath);
      return ok({ path: input.archivePath, count: entries.length, entries: entries.slice(0, 500), truncated: entries.length > 500 });
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    ArchiveInspectOutputSchema
  );

  registerTool(
    server,
    "ytdlp_check_archive",
    "Check whether an exact yt-dlp archive entry string exists in an archive file under the configured filesystem policy. This does not resolve a video URL into its archive ID.",
    ArchivePathInputSchema,
    async (input) => {
      const entries = readArchiveSafe(input.archivePath);
      return ok({ path: input.archivePath, entry: input.entry, exists: input.entry ? entries.includes(input.entry) : false, count: entries.length });
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    ArchiveCheckOutputSchema
  );

  registerTool(
    server,
    "ytdlp_update_archive",
    "Return a safe archive-update plan and recommendation without writing the archive. Prefer using downloadArchive on download tools so yt-dlp writes canonical extractor IDs.",
    ArchivePathInputSchema,
    async (input) => ok({ path: input.archivePath, entry: input.entry, planned: true, recommendation: "Prefer --download-archive via ytdlp_download_* so yt-dlp writes canonical extractor IDs." }),
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    ArchiveUpdateOutputSchema
  );
}
