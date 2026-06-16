import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { formatDoctorReport, renderClientConfig, renderDependencyInstall } from "../src/cli.js";
import { createServer } from "../src/server.js";
import { validateExpertArgs } from "../src/runtime.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("MCP server assembly", () => {
  it("registers tools, resources, and prompts without throwing", () => {
    expect(() => createServer()).not.toThrow();
  });

  it("serves tools over stdio", async () => {
    const client = new Client({ name: "yt-dlp-mcp-server-test", version: "0.0.0" }, { capabilities: {} });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", path.join(repoRoot, "src/index.ts")],
      cwd: repoRoot,
      env: safeEnv({
        YTDLP_MCP_TIMEOUT_MS: "1000",
        YTDLP_MCP_OUTPUT_ROOT: path.join(repoRoot, ".tmp-test-downloads")
      }),
      stderr: "pipe"
    });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("ytdlp_plan_download");
      expect(tools.tools.map((tool) => tool.name)).toContain("ytdlp_execute_expert");
    } finally {
      await client.close();
    }
  });

  it("accepts video as the public plan download kind", async () => {
    await withTestClient(async (client) => {
      const result = await client.callTool({
        name: "ytdlp_plan_download",
        arguments: { url: "https://example.com/video", kind: "video" }
      });

      const structured = result.structuredContent as { ok?: boolean; data?: { kind?: string; facts?: { dependencies?: { required?: unknown[] } } } };
      expect(structured.ok).toBe(true);
      expect(structured.data?.kind).toBe("media");
      expect(Array.isArray(structured.data?.facts?.dependencies?.required)).toBe(true);
    });
  });

  it("accepts postprocess plans without an internal workflow kind", async () => {
    await withTestClient(async (client) => {
      const result = await client.callTool({
        name: "ytdlp_plan_postprocess",
        arguments: { url: "https://example.com/video", postprocess: { extractAudio: true, audioFormat: "mp3" } }
      });

      const structured = result.structuredContent as { ok?: boolean; data?: { kind?: string; facts?: { dependencies?: { required?: unknown[] } } } };
      expect(structured.ok).toBe(true);
      expect(structured.data?.kind).toBe("postprocess");
      expect(Array.isArray(structured.data?.facts?.dependencies?.required)).toBe(true);
    });
  });

  it("accepts expert args without an internal workflow kind", async () => {
    await withTestClient(async (client) => {
      const result = await client.callTool({ name: "ytdlp_execute_expert", arguments: { args: ["--version"] } });

      const structured = result.structuredContent as { ok?: boolean; data?: { allowed?: boolean; reason?: string } };
      expect(structured.ok).toBe(true);
      expect(structured.data?.allowed).toBe(false);
      expect(structured.data?.reason).toContain("YTDLP_MCP_ENABLE_EXPERT");
    });
  });

  it("forces postprocess tools to plan media downloads", async () => {
    await withTestClient(async (client) => {
      const result = await client.callTool({
        name: "ytdlp_remux",
        arguments: {
          url: "https://example.com/video",
          kind: "thumbnail",
          dryRun: true,
          output: { outputRoot: path.join(repoRoot, ".tmp-test-downloads"), outputTemplate: "remux.%(ext)s", allowOverwrite: true }
        }
      });

      const structured = result.structuredContent as { ok?: boolean; data?: { plan?: { kind?: string; args?: string[] } } };
      expect(structured.ok).toBe(true);
      expect(structured.data?.plan?.kind).toBe("media");
      expect(structured.data?.plan?.args).toContain("--remux-video");
      expect(structured.data?.plan?.args).not.toContain("--write-thumbnail");
    });
  });
});

describe("expert mode policy", () => {
  it("blocks self-update and path-gated options by default", () => {
    const validation = validateExpertArgs(["--update", "--paths", "home:/tmp"]);
    expect(validation.valid).toBe(false);
    expect(validation.blocked.join("\n")).toMatch(/--update: blocked by policy/);
    expect(validation.blocked.join("\n")).toMatch(/--paths: path-gated by server policy/);
  });
});

describe("CLI install helpers", () => {
  it("renders Docker config for common mcpServers clients", () => {
    const rendered = renderClientConfig({
      client: "claude",
      mode: "docker",
      targetOs: "macos",
      outputRoot: "/Users/alex/Downloads/yt-dlp-mcp",
      image: "ghcr.io/antonio-orionus/yt-dlp-mcp-server:0.2.0",
      packageSpec: "yt-dlp-mcp-server@latest",
      serverPath: "/repo/dist/index.js"
    });

    const parsed = JSON.parse(rendered.split("\n").slice(1).join("\n")) as {
      mcpServers: { "yt-dlp": { command: string; args: string[] } };
    };
    expect(parsed.mcpServers["yt-dlp"].command).toBe("docker");
    expect(parsed.mcpServers["yt-dlp"].args).toContain("/Users/alex/Downloads/yt-dlp-mcp:/downloads");
    expect(parsed.mcpServers["yt-dlp"].args).toContain("ghcr.io/antonio-orionus/yt-dlp-mcp-server:0.2.0");
  });

  it("renders Windows npx config with .cmd command resolution", () => {
    const rendered = renderClientConfig({
      client: "vscode",
      mode: "npx",
      targetOs: "windows",
      outputRoot: "C:\\Users\\alex\\Downloads\\yt-dlp-mcp",
      image: "unused",
      packageSpec: "yt-dlp-mcp-server@latest",
      serverPath: "unused"
    });

    const parsed = JSON.parse(rendered.split("\n").slice(1).join("\n")) as {
      servers: { "yt-dlp": { command: string; args: string[]; env: Record<string, string> } };
    };
    expect(parsed.servers["yt-dlp"].command).toBe("npx.cmd");
    expect(parsed.servers["yt-dlp"].args).toEqual(["-y", "yt-dlp-mcp-server@latest"]);
    expect(parsed.servers["yt-dlp"].env.YTDLP_MCP_OUTPUT_ROOT).toBe("C:\\Users\\alex\\Downloads\\yt-dlp-mcp");
  });

  it("renders Codex Desktop config.toml with Windows paths preserved", () => {
    const rendered = renderClientConfig({
      client: "codex",
      mode: "npx",
      targetOs: "windows",
      outputRoot: "C:\\Users\\alex\\Downloads\\yt-dlp-mcp",
      image: "unused",
      packageSpec: "yt-dlp-mcp-server@latest",
      serverPath: "unused"
    });

    expect(rendered).toContain("# Codex Desktop config.toml (npx)");
    expect(rendered).toContain("[mcp_servers.yt-dlp]");
    expect(rendered).toContain("enabled = true");
    expect(rendered).toContain("command = 'npx.cmd'");
    expect(rendered).toContain("args = ['-y', 'yt-dlp-mcp-server@latest']");
    expect(rendered).toContain("[mcp_servers.yt-dlp.env]");
    expect(rendered).toContain("YTDLP_MCP_OUTPUT_ROOT = 'C:\\Users\\alex\\Downloads\\yt-dlp-mcp'");
  });

  it("renders casual Windows dependency commands with winget", () => {
    const rendered = renderDependencyInstall({
      targetOs: "windows",
      manager: "winget",
      includePackageInstall: true
    });

    expect(rendered).toContain("winget install -e --id OpenJS.NodeJS.LTS");
    expect(rendered).toContain("winget install -e --id yt-dlp.yt-dlp");
    expect(rendered).not.toContain("winget install -e --id Gyan.FFmpeg");
    expect(rendered).toContain("The yt-dlp winget package installs Deno and yt-dlp.FFmpeg dependencies.");
    expect(rendered).toContain("npm install -g yt-dlp-mcp-server");
  });

  it("renders Linux dependency guidance with the supported Node floor", () => {
    const rendered = renderDependencyInstall({
      targetOs: "linux",
      manager: "apt",
      includePackageInstall: true
    });

    expect(rendered).toContain("Ensure `node --version` is >= 22.13 before using npm/npx mode.");
    expect(rendered).not.toContain(">= 20");
  });

  it("marks doctor ready only when required yt-dlp is available", () => {
    const ready = formatDoctorReport({
      platform: "linux",
      arch: "x64",
      node: { version: "v24.0.0", execPath: "/usr/bin/node" },
      dependencies: [
        { name: "yt-dlp", status: "available", command: "yt-dlp", version: "2026.03.17", requiredFor: [], notes: [] },
        { name: "ffmpeg", status: "missing", command: "ffmpeg", requiredFor: [], notes: ["missing"] },
        { name: "ffprobe", status: "missing", command: "ffprobe", requiredFor: [], notes: ["missing"] }
      ],
      cookies: { fileConfigured: false, browserConfigured: false },
      policy: {
        outputRoot: "/tmp/out",
        tempRoot: "/tmp/temp",
        allowArbitraryOutputPaths: false,
        allowConfigFiles: false,
        allowPluginDirs: false,
        enableExpertMode: false
      }
    });

    expect(ready.ready).toBe(true);
    expect(ready.status).toBe("ready_with_warnings");
    expect(ready.text).toContain("ready for inspect/plan");
  });
});

function safeEnv(overrides: Record<string, string>): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    ...overrides
  };
}

async function withTestClient(callback: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client({ name: "yt-dlp-mcp-server-test", version: "0.0.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", path.join(repoRoot, "src/index.ts")],
    cwd: repoRoot,
    env: safeEnv({
      YTDLP_MCP_TIMEOUT_MS: "1000",
      YTDLP_MCP_OUTPUT_ROOT: path.join(repoRoot, ".tmp-test-downloads")
    }),
    stderr: "pipe"
  });

  try {
    await client.connect(transport);
    await callback(client);
  } finally {
    await client.close();
  }
}
