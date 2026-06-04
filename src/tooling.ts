import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GenericOutputSchema, toStructuredError } from "yt-dlp-bridge";
import { z } from "zod";

export type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export function registerTool<T extends z.ZodType>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: T,
  handler: (input: z.infer<T>) => Promise<CallToolResult> | CallToolResult,
  annotations: ToolAnnotations,
  outputSchema: z.ZodType = GenericOutputSchema
): void {
  const register = server.registerTool.bind(server) as unknown as (
    toolName: string,
    config: {
      title: string;
      description: string;
      inputSchema: z.ZodType;
      outputSchema: z.ZodType;
      annotations: ToolAnnotations;
    },
    callback: (input: unknown) => Promise<CallToolResult>
  ) => void;

  register(
    name,
    {
      title: titleize(name),
      description,
      inputSchema,
      outputSchema,
      annotations
    },
    async (input) => {
      try {
        return await handler(input as z.infer<T>);
      } catch (error) {
        const structured = toStructuredError(error);
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: structured }, null, 2) }],
          structuredContent: { ok: false, error: structured }
        };
      }
    }
  );
}

export function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: true, data }, null, 2) }],
    structuredContent: { ok: true, data }
  };
}

function titleize(name: string): string {
  return name
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
