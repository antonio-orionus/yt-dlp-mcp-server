import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { planWorkflow } from "yt-dlp-bridge";
import { CONFIG } from "yt-dlp-bridge/config";
import { checkEnvironment } from "yt-dlp-bridge/environment";
import { UPSTREAM_OPTION_CATALOG, listLongFlags } from "yt-dlp-bridge/option-catalog";
import { ValidateWorkflowInputSchema, WorkflowDownloadInputSchema, WorkflowPostprocessInputSchema } from "yt-dlp-bridge/schemas";
import { z } from "zod";
import { PlanDownloadOutputSchema, PlanPostprocessOutputSchema, ValidateOptionsOutputSchema } from "../output-schemas.js";
import { ok, registerTool } from "../tooling.js";

const PlanDownloadInputSchema = WorkflowDownloadInputSchema.extend({
  kind: z.enum(["video", "media", "audio", "subtitles", "thumbnail", "playlist"]).default("media")
});

const PlanPostprocessInputSchema = WorkflowPostprocessInputSchema.omit({ kind: true });

export function registerPlanTools(server: McpServer): void {
  registerTool(
    server,
    "ytdlp_plan_download",
    "Dry-run a video, audio, subtitle, thumbnail, or playlist download without writing files. Use to answer what would happen, which format best quality resolves to, required dependencies, output paths, risks, and exact yt-dlp argv.",
    PlanDownloadInputSchema,
    async (input) => {
      const environment = await checkEnvironment(CONFIG);
      const kind = input.kind === "video" ? "media" : input.kind;
      return ok(planWorkflow({ ...input, kind }, { config: CONFIG, detectedDependencies: environment.dependencies, configFiles: { mode: "disabled" } }));
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    PlanDownloadOutputSchema
  );

  registerTool(
    server,
    "ytdlp_plan_postprocess",
    "Dry-run post-processing without writing files. Use to explain ffmpeg requirements, output policy, risks, and side effects for remux, recode, audio extraction, embedded assets, chapters, or SponsorBlock.",
    PlanPostprocessInputSchema,
    async (input) => {
      const environment = await checkEnvironment(CONFIG);
      return ok(planWorkflow({ ...input, kind: "postprocess" }, { config: CONFIG, detectedDependencies: environment.dependencies, configFiles: { mode: "disabled" } }));
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    PlanPostprocessOutputSchema
  );

  registerTool(
    server,
    "ytdlp_validate_options",
    "Validate typed yt-dlp option input and expose the source-derived option catalog. Use to answer whether a flag or option is supported without executing yt-dlp.",
    ValidateWorkflowInputSchema,
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
