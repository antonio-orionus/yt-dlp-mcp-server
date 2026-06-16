import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONFIG } from "yt-dlp-bridge/config";
import { checkEnvironment } from "yt-dlp-bridge/environment";
import { EmptyInputSchema } from "yt-dlp-bridge/schemas";
import { EnvironmentOutputSchema, ReadOnlyCommandOutputSchema } from "../output-schemas.js";
import { runReadOnly } from "../runtime.js";
import { ok, registerTool } from "../tooling.js";

export function registerEnvironmentTools(server: McpServer): void {
  registerTool(
    server,
    "ytdlp_check_environment",
    "Check whether this MCP server can run yt-dlp workflows on the host. Use before the first download or when PATH, ffmpeg, ffprobe, cookies, plugins, or policy settings may be misconfigured.",
    EmptyInputSchema,
    async () => ok(await checkEnvironment(CONFIG)),
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    EnvironmentOutputSchema
  );

  registerTool(
    server,
    "ytdlp_list_extractors",
    "List all site extractors supported by the installed yt-dlp binary. Use when the user asks whether a website or URL family is supported.",
    EmptyInputSchema,
    async () => runReadOnly(["--ignore-config", "--list-extractors"]),
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    ReadOnlyCommandOutputSchema
  );

  registerTool(
    server,
    "ytdlp_list_impersonation_targets",
    "List browser impersonation targets supported by the installed yt-dlp binary. Use when a download needs browser-like request headers or extractor troubleshooting.",
    EmptyInputSchema,
    async () => runReadOnly(["--ignore-config", "--list-impersonate-targets"]),
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    ReadOnlyCommandOutputSchema
  );
}
