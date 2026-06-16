import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONFIG } from "yt-dlp-bridge/config";
import { checkEnvironment } from "yt-dlp-bridge/environment";
import { UPSTREAM_OPTION_CATALOG } from "yt-dlp-bridge/option-catalog";

const TOOL_GROUPS = {
  environment: ["ytdlp_check_environment", "ytdlp_list_extractors", "ytdlp_list_impersonation_targets"],
  inspect: ["ytdlp_search_videos", "ytdlp_get_metadata", "ytdlp_list_formats", "ytdlp_list_subtitles", "ytdlp_list_thumbnails", "ytdlp_probe_url"],
  plan: ["ytdlp_plan_download", "ytdlp_plan_postprocess", "ytdlp_validate_options"],
  download: ["ytdlp_download_video", "ytdlp_download_audio", "ytdlp_download_subtitles", "ytdlp_download_thumbnail", "ytdlp_download_playlist"],
  archive: ["ytdlp_inspect_archive", "ytdlp_check_archive", "ytdlp_update_archive"],
  postprocess: ["ytdlp_remux", "ytdlp_recode", "ytdlp_extract_audio", "ytdlp_embed_assets", "ytdlp_split_chapters", "ytdlp_remove_chapters", "ytdlp_apply_sponsorblock"],
  expert: ["ytdlp_execute_expert"]
};

export function registerResources(server: McpServer): void {
  registerJsonResource(server, "ytdlp_capabilities", "ytdlp://capabilities", "Tool capability map", () => ({
    transport: "stdio",
    toolGroups: TOOL_GROUPS,
    routingHints: [
      "For permitted user requests to download/save/fetch a media URL, including youtube.com and youtu.be links, use ytdlp_download_video unless the user asks for audio, subtitles, thumbnails, a playlist, or a dry-run plan.",
      "For 'best quality' video requests, use ytdlp_download_video with default format selection unless the user specifies a different format.",
      "Use inspect tools only when the user asks to search, list formats, list subtitles, list thumbnails, probe support, or inspect metadata without writing files."
    ],
    differentiators: ["source-derived option catalog", "dependency-aware planning", "safe argv spawn", "structured yt-dlp errors"]
  }));

  registerJsonResource(server, "ytdlp_option_catalog_groups", "ytdlp://option-catalog/groups", "Source-derived yt-dlp option catalog groups", () => ({
    source: UPSTREAM_OPTION_CATALOG.source,
    ytDlpVersion: UPSTREAM_OPTION_CATALOG.ytDlpVersion,
    optionCount: UPSTREAM_OPTION_CATALOG.optionCount,
    groups: UPSTREAM_OPTION_CATALOG.groups
  }));

  registerJsonResource(server, "ytdlp_safety_policy", "ytdlp://safety-policy", "Filesystem and expert-mode safety policy", () => ({
    outputRoot: CONFIG.outputRoot,
    tempRoot: CONFIG.tempRoot,
    allowArbitraryOutputPaths: CONFIG.allowArbitraryOutputPaths,
    allowConfigFiles: CONFIG.allowConfigFiles,
    allowPluginDirs: CONFIG.allowPluginDirs,
    enableExpertMode: CONFIG.enableExpertMode,
    expertMode: "disabled by default; unsafe/path-gated flags are policy-validated before execution"
  }));

  server.registerResource(
    "ytdlp_troubleshooting",
    "ytdlp://troubleshooting",
    {
      title: "yt-dlp troubleshooting",
      description: "Safe troubleshooting checklist for common yt-dlp MCP failures.",
      mimeType: "text/markdown"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: [
            "# yt-dlp MCP troubleshooting",
            "",
            "- Run `ytdlp_check_environment` first.",
            "- If a plan requires `ffmpeg` or `ffprobe`, install them or use the Docker image.",
            "- For bot, auth, age, or login failures, configure cookies with `YTDLP_MCP_COOKIES_FILE` or `YTDLP_MCP_COOKIES_FROM_BROWSER`.",
            "- For path errors, keep outputs under `YTDLP_MCP_OUTPUT_ROOT` or explicitly enable arbitrary paths.",
            "- Use `dryRun: true` on download tools before executing large playlist or postprocess jobs."
          ].join("\n")
        }
      ]
    })
  );

  registerJsonResource(server, "ytdlp_environment_summary", "ytdlp://environment", "Current detected environment summary", async () => checkEnvironment(CONFIG));
}

function registerJsonResource(server: McpServer, name: string, uri: string, description: string, read: () => unknown | Promise<unknown>): void {
  server.registerResource(
    name,
    uri,
    { title: name, description, mimeType: "application/json" },
    async (resourceUri) => ({
      contents: [
        {
          uri: resourceUri.href,
          mimeType: "application/json",
          text: JSON.stringify(await read(), null, 2)
        }
      ]
    })
  );
}
