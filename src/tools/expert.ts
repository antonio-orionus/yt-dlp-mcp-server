import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONFIG, ExpertInputSchema, redactArgs } from "yt-dlp-bridge";
import { ExpertOutputSchema } from "../output-schemas.js";
import { runYtdlp, validateExpertArgs } from "../runtime.js";
import { ok, registerTool } from "../tooling.js";

export function registerExpertTools(server: McpServer): void {
  registerTool(
    server,
    "ytdlp_execute_expert",
    "Execute reviewed raw yt-dlp argv only when typed tools cannot express the request. Disabled unless YTDLP_MCP_ENABLE_EXPERT=true; dry-run is default and unsafe/path-gated flags are blocked by policy.",
    ExpertInputSchema,
    async (input) => {
      if (!CONFIG.enableExpertMode) {
        return ok({ allowed: false, reason: "Set YTDLP_MCP_ENABLE_EXPERT=true to enable expert mode." });
      }
      const validation = validateExpertArgs(input.args);
      if (!validation.valid) return ok({ allowed: false, blocked: validation.blocked, redactedArgs: redactArgs(input.args) });
      const args = input.dryRun ? ["--simulate", ...input.args] : input.args;
      if (input.url) args.push(input.url);
      if (input.dryRun) return ok({ allowed: true, dryRun: true, argv: args, redactedArgv: redactArgs(args) });
      const result = await runYtdlp(args);
      return ok({ argv: result.args, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, durationMs: result.durationMs });
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    ExpertOutputSchema
  );
}
