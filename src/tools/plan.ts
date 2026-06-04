import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONFIG, PlanDownloadInputSchema, PostprocessInputSchema, UPSTREAM_OPTION_CATALOG, ValidateOptionsInputSchema, listLongFlags, planDownload, planPostprocess } from "yt-dlp-bridge";
import { PlanDownloadOutputSchema, PlanPostprocessOutputSchema, ValidateOptionsOutputSchema } from "../output-schemas.js";
import { ok, registerTool } from "../tooling.js";

export function registerPlanTools(server: McpServer): void {
  registerTool(
    server,
    "ytdlp_plan_download",
    "Dry-run a video, audio, subtitle, thumbnail, or playlist download without writing files. Use to answer what would happen, which format best quality resolves to, required dependencies, output paths, risks, and exact yt-dlp argv.",
    PlanDownloadInputSchema,
    async (input) => ok(await planDownload(input, CONFIG)),
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    PlanDownloadOutputSchema
  );

  registerTool(
    server,
    "ytdlp_plan_postprocess",
    "Dry-run post-processing without writing files. Use to explain ffmpeg requirements, output policy, risks, and side effects for remux, recode, audio extraction, embedded assets, chapters, or SponsorBlock.",
    PostprocessInputSchema,
    async (input) => ok(await planPostprocess(input, CONFIG)),
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    PlanPostprocessOutputSchema
  );

  registerTool(
    server,
    "ytdlp_validate_options",
    "Validate typed yt-dlp option input and expose the source-derived option catalog. Use to answer whether a flag or option is supported without executing yt-dlp.",
    ValidateOptionsInputSchema,
    async (input) =>
      ok({
        valid: true,
        catalog: {
          source: UPSTREAM_OPTION_CATALOG.source,
          ytDlpVersion: UPSTREAM_OPTION_CATALOG.ytDlpVersion,
          optionCount: UPSTREAM_OPTION_CATALOG.optionCount,
          groups: UPSTREAM_OPTION_CATALOG.groups
        },
        knownLongFlags: listLongFlags(),
        input
      }),
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    ValidateOptionsOutputSchema
  );
}
