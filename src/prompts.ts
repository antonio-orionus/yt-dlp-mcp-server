import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "archive_playlist_safely",
    {
      title: "Archive playlist safely",
      description: "Guide an agent through planning and downloading only new playlist entries.",
      argsSchema: { url: z.string().url(), archivePath: z.string() }
    },
    ({ url, archivePath }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Plan a playlist archive for ${url} using archive ${archivePath}. First call ytdlp_plan_download with kind=playlist and downloadArchive, then verify dependencies before downloading.`
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "choose_smallest_acceptable_format",
    {
      title: "Choose smallest acceptable format",
      description: "Guide format selection toward smallest acceptable media.",
      argsSchema: { url: z.string().url(), maxHeight: z.string().optional() }
    },
    ({ url, maxHeight }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `List formats for ${url}, then plan a download using formatSort ["+size","+br","+res","+fps"]${maxHeight ? ` and a height limit of ${maxHeight}` : ""}.`
          }
        }
      ]
    })
  );
}
