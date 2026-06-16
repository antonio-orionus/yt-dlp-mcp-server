import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerArchiveTools } from "./tools/archive.js";
import { registerDownloadTools } from "./tools/download.js";
import { registerEnvironmentTools } from "./tools/environment.js";
import { registerExpertTools } from "./tools/expert.js";
import { registerInspectTools } from "./tools/inspect.js";
import { registerPlanTools } from "./tools/plan.js";
import { registerPostprocessTools } from "./tools/postprocess.js";

export const VERSION = "0.2.0";

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "yt-dlp-mcp-server",
      version: VERSION
    },
    {
      capabilities: {
        tools: {},
        logging: {},
        prompts: {},
        resources: {}
      }
    }
  );

  registerEnvironmentTools(server);
  registerInspectTools(server);
  registerPlanTools(server);
  registerDownloadTools(server);
  registerArchiveTools(server);
  registerPostprocessTools(server);
  registerExpertTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}
