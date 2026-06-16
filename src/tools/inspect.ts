import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { planWorkflow } from "yt-dlp-bridge";
import { CONFIG } from "yt-dlp-bridge/config";
import { paginate, parseFormats, parseJsonLines, parseSubtitles, parseThumbnails, sanitizeMetadataItems } from "yt-dlp-bridge/parsers";
import { AuthOptionsSchema, InspectInputSchema, NetworkOptionsSchema } from "yt-dlp-bridge/schemas";
import { FormatListOutputSchema, MetadataOutputSchema, ProbeOutputSchema, SearchOutputSchema, SubtitleListOutputSchema, ThumbnailListOutputSchema } from "../output-schemas.js";
import { runYtdlp } from "../runtime.js";
import { ok, registerTool } from "../tooling.js";

const SearchInputSchema = z.object({
  query: z.string().min(1).max(300),
  source: z.enum(["youtube"]).default("youtube"),
  limit: z.number().int().positive().max(50).default(10),
  offset: z.number().int().nonnegative().max(200).default(0),
  auth: AuthOptionsSchema.default({}),
  network: NetworkOptionsSchema.default({})
});

type SearchRawItem = Record<string, unknown>;

export function registerInspectTools(server: McpServer): void {
  registerTool(
    server,
    "ytdlp_search_videos",
    "Search YouTube through yt-dlp without downloading media and return compact video results. Use when the user asks to find videos before choosing one to inspect or download.",
    SearchInputSchema,
    async (input) => {
      const requested = input.offset + input.limit;
      const result = await runYtdlp(buildSearchArgs(input, requested));
      const parsed = parseJsonLines<SearchRawItem>(result.stdout);
      const items = parsed.items.map(sanitizeSearchItem);
      return ok({ query: input.query, source: input.source, items: paginate(items, input.offset, input.limit), parseErrors: parsed.parseErrors, rawBytes: result.stdout.length });
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    SearchOutputSchema
  );

  registerTool(
    server,
    "ytdlp_get_metadata",
    "Extract structured metadata for a media URL without downloading files using yt-dlp --dump-json. Use to inspect title, duration, uploader, formats, subtitles, thumbnails, and selected best format.",
    InspectInputSchema,
    async (input) => {
      const result = await runYtdlp(planWorkflow({ ...input, kind: "inspect", inspect: "metadata" }, { config: CONFIG, configFiles: { mode: "disabled" } }).args);
      const parsed = parseJsonLines(result.stdout);
      const items = sanitizeMetadataItems(parsed.items);
      return ok({ items: paginate(items, input.offset, input.limit), parseErrors: parsed.parseErrors, rawBytes: result.stdout.length });
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    MetadataOutputSchema
  );

  registerTool(
    server,
    "ytdlp_list_formats",
    "List available audio/video formats for a media URL without downloading files. Use when the user asks what quality, codec, resolution, bitrate, or format IDs are available.",
    InspectInputSchema,
    async (input) => {
      const result = await runYtdlp(planWorkflow({ ...input, kind: "inspect", inspect: "formats" }, { config: CONFIG, configFiles: { mode: "disabled" } }).args);
      const items = parseFormats(result.stdout);
      return ok({ items: paginate(items, input.offset, input.limit), rawBytes: result.stdout.length });
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    FormatListOutputSchema
  );

  registerTool(
    server,
    "ytdlp_list_subtitles",
    "List available manual subtitles and automatic captions for a media URL without downloading files. Use when the user asks which subtitle languages or formats exist.",
    InspectInputSchema,
    async (input) => {
      const result = await runYtdlp(planWorkflow({ ...input, kind: "inspect", inspect: "subtitles" }, { config: CONFIG, configFiles: { mode: "disabled" } }).args);
      const items = parseSubtitles(result.stdout);
      return ok({ items: paginate(items, input.offset, input.limit), rawBytes: result.stdout.length });
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    SubtitleListOutputSchema
  );

  registerTool(
    server,
    "ytdlp_list_thumbnails",
    "List available thumbnails for a media URL without downloading files. Use when the user asks for cover images, thumbnail URLs, resolutions, or poster options.",
    InspectInputSchema,
    async (input) => {
      const result = await runYtdlp(planWorkflow({ ...input, kind: "inspect", inspect: "thumbnails" }, { config: CONFIG, configFiles: { mode: "disabled" } }).args);
      const items = parseThumbnails(result.stdout);
      return ok({ items: paginate(items, input.offset, input.limit), rawBytes: result.stdout.length });
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    ThumbnailListOutputSchema
  );

  registerTool(
    server,
    "ytdlp_probe_url",
    "Probe whether yt-dlp supports a media URL and identify the extractor without downloading files. Use for quick support checks before planning or downloading.",
    InspectInputSchema,
    async (input) => {
      const result = await runYtdlp(planWorkflow({ ...input, kind: "inspect", inspect: "single-json" }, { config: CONFIG, configFiles: { mode: "disabled" } }).args);
      const parsed = parseJsonLines(result.stdout);
      const items = sanitizeMetadataItems(parsed.items);
      return ok({ supported: true, items: paginate(items, input.offset, input.limit), parseErrors: parsed.parseErrors, rawBytes: result.stdout.length });
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    ProbeOutputSchema
  );
}

function buildSearchArgs(input: z.infer<typeof SearchInputSchema>, requested: number): string[] {
  const target = `${searchPrefix(input.source)}${Math.max(1, Math.min(250, requested))}:${input.query}`;
  const args = ["--ignore-config", "--no-warnings", "--flat-playlist"];

  appendNetworkArgs(args, input.network);
  appendAuthArgs(args, input.auth);
  args.push("--dump-json", target);
  return args;
}

function searchPrefix(source: z.infer<typeof SearchInputSchema>["source"]): string {
  if (source === "youtube") return "ytsearch";
  return "ytsearch";
}

function appendNetworkArgs(args: string[], network: z.infer<typeof NetworkOptionsSchema>): void {
  push(args, "--proxy", network.proxy);
  if (network.socketTimeout !== undefined) push(args, "--socket-timeout", String(network.socketTimeout));
  push(args, "--source-address", network.sourceAddress);
  push(args, "--impersonate", network.impersonate);
  push(args, "--geo-verification-proxy", network.geoVerificationProxy);
  push(args, "--xff", network.xff);
  if (network.forceIpv4) args.push("--force-ipv4");
  if (network.forceIpv6) args.push("--force-ipv6");
}

function appendAuthArgs(args: string[], auth: z.infer<typeof AuthOptionsSchema>): void {
  push(args, "--username", auth.username);
  push(args, "--password", auth.password);
  push(args, "--twofactor", auth.twofactor);
  if (auth.netrc) {
    requireConfigFilePolicy("auth.netrc");
    args.push("--netrc");
  }
  if (auth.netrcLocation) requireConfigFilePolicy("auth.netrcLocation");
  if (auth.netrcCmd) requireConfigFilePolicy("auth.netrcCmd");
  push(args, "--netrc-location", auth.netrcLocation);
  push(args, "--netrc-cmd", auth.netrcCmd);
  push(args, "--video-password", auth.videoPassword);
  push(args, "--cookies", configuredOrAllowed(auth.cookiesFile, CONFIG.cookiesFile, "auth.cookiesFile"));
  push(args, "--cookies-from-browser", configuredOrAllowed(auth.cookiesFromBrowser, CONFIG.cookiesFromBrowser, "auth.cookiesFromBrowser"));
}

function sanitizeSearchItem(source: SearchRawItem): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  copyString(source, result, "id", "id");
  copyString(source, result, "title", "title");
  copyString(source, result, "webpage_url", "webpageUrl");
  copyString(source, result, "url", "webpageUrl");
  copyNumber(source, result, "duration", "duration");
  copyString(source, result, "duration_string", "durationString");
  copyString(source, result, "channel", "channel");
  copyString(source, result, "channel_id", "channelId");
  copyString(source, result, "channel_url", "channelUrl");
  copyString(source, result, "uploader", "uploader");
  copyString(source, result, "uploader_id", "uploaderId");
  copyNumber(source, result, "view_count", "viewCount");
  copyString(source, result, "live_status", "liveStatus");
  copyString(source, result, "extractor", "extractor");
  copyString(source, result, "extractor_key", "extractorKey");
  copyNumber(source, result, "playlist_index", "playlistIndex");
  return result;
}

function push(args: string[], flag: string, value: string | undefined): void {
  if (value !== undefined && value !== "") args.push(flag, value);
}

function configuredOrAllowed(inputValue: string | undefined, configuredValue: string | undefined, label: string): string | undefined {
  if (inputValue !== undefined && inputValue !== configuredValue) requireConfigFilePolicy(label);
  return inputValue ?? configuredValue;
}

function requireConfigFilePolicy(label: string): void {
  if (!CONFIG.allowConfigFiles) throw new Error(`${label} requires YTDLP_MCP_ALLOW_CONFIG_FILES=true or a matching server-level environment setting`);
}

function copyString(source: Record<string, unknown>, target: Record<string, unknown>, sourceKey: string, targetKey: string): void {
  const value = source[sourceKey];
  if (typeof value === "string") target[targetKey] = value;
}

function copyNumber(source: Record<string, unknown>, target: Record<string, unknown>, sourceKey: string, targetKey: string): void {
  const value = source[sourceKey];
  if (typeof value === "number" && Number.isFinite(value)) target[targetKey] = value;
}
