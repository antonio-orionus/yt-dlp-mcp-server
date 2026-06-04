import os from "node:os";
import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CONFIG, checkEnvironment, type DetectedDependency, type EnvironmentReport } from "yt-dlp-bridge";
import { createServer, VERSION } from "./server.js";

type CliIo = {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdin: Pick<NodeJS.ReadStream, "isTTY">;
  cwd: string;
};

type ClientName = "claude" | "cursor" | "windsurf" | "cline" | "vscode" | "warp" | "codex" | "all";
type InstallMode = "docker" | "npx" | "global" | "source";
type TargetOs = "current" | "macos" | "windows" | "linux";
type DependencyManager = "auto" | "winget" | "scoop" | "choco" | "brew" | "apt" | "dnf" | "pacman" | "pipx";

type LaunchConfig = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type PrintConfigOptions = {
  client: ClientName;
  mode: InstallMode;
  targetOs: TargetOs;
  outputRoot: string;
  image: string;
  packageSpec: string;
  serverPath: string;
};

type PrintDepsOptions = {
  targetOs: TargetOs;
  manager: DependencyManager;
  includePackageInstall: boolean;
};

type ParsedArgs = {
  positional: string[];
  flags: Map<string, string | true>;
};

const DOCKER_IMAGE = "ghcr.io/antonio-orionus/yt-dlp-mcp-server:0.1.0";
const PACKAGE_SPEC = "yt-dlp-mcp-server@latest";

export async function runCli(argv = process.argv.slice(2), io: CliIo = defaultIo()): Promise<number> {
  const command = argv[0];

  if (!command) {
    if (io.stdin.isTTY) {
      io.stdout.write(helpText());
      return 0;
    }
    await startStdioServer();
    return 0;
  }

  if (["stdio", "serve", "server", "--stdio"].includes(command)) {
    await startStdioServer();
    return 0;
  }

  if (["help", "--help", "-h"].includes(command)) {
    io.stdout.write(helpText());
    return 0;
  }

  if (["doctor", "check"].includes(command)) {
    return runDoctor(argv.slice(1), io);
  }

  if (["print-deps", "deps"].includes(command)) {
    try {
      return runPrintDeps(argv.slice(1), io);
    } catch (error) {
      io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${helpText()}`);
      return 64;
    }
  }

  if (["print-config", "config"].includes(command)) {
    try {
      return runPrintConfig(argv.slice(1), io);
    } catch (error) {
      io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${helpText()}`);
      return 64;
    }
  }

  io.stderr.write(`Unknown command: ${command}\n\n${helpText()}`);
  return 64;
}

export async function startStdioServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runDoctor(argv: string[], io: CliIo): Promise<number> {
  const parsed = parseArgs(argv);
  const json = parsed.flags.has("json");
  const report = await checkEnvironment(CONFIG);
  const formatted = formatDoctorReport(report);

  if (json) {
    io.stdout.write(`${JSON.stringify({ ok: formatted.ready, status: formatted.status, data: report, suggestions: formatted.suggestions }, null, 2)}\n`);
  } else {
    io.stdout.write(`${formatted.text}\n`);
  }

  return formatted.ready ? 0 : 1;
}

function runPrintConfig(argv: string[], io: CliIo): number {
  const options = parsePrintConfigOptions(argv, io.cwd);
  io.stdout.write(`${renderClientConfig(options)}\n`);
  return 0;
}

function runPrintDeps(argv: string[], io: CliIo): number {
  const parsed = parseArgs(argv);
  const options: PrintDepsOptions = {
    targetOs: parseTargetOs(flag(parsed, "os") ?? "current"),
    manager: parseDependencyManager(flag(parsed, "manager") ?? "auto"),
    includePackageInstall: !parsed.flags.has("media-only")
  };
  io.stdout.write(`${renderDependencyInstall(options)}\n`);
  return 0;
}

export function renderClientConfig(options: PrintConfigOptions): string {
  if (options.client === "all") {
    return (["claude", "vscode", "warp", "codex"] as const)
      .map((client) => renderClientSection({ ...options, client }))
      .join("\n\n");
  }
  return renderClientSection(options);
}

export function renderDependencyInstall(options: PrintDepsOptions): string {
  const targetOs = options.targetOs === "current" ? currentTargetOs() : options.targetOs;
  const manager = options.manager === "auto" ? defaultDependencyManager(targetOs) : options.manager;
  const lines = [
    `# ${dependencyTitle(targetOs, manager)}`,
    "# Node runs yt-dlp-mcp-server and npx. It is not required by yt-dlp itself.",
    ""
  ];

  if (targetOs === "windows") {
    if (manager === "winget") {
      lines.push(
        "winget install -e --id OpenJS.NodeJS.LTS",
        "winget install -e --id yt-dlp.yt-dlp",
        "",
        "# The yt-dlp winget package installs Deno and yt-dlp.FFmpeg dependencies."
      );
    } else if (manager === "scoop") {
      lines.push("scoop install nodejs-lts yt-dlp ffmpeg");
    } else if (manager === "choco") {
      lines.push("choco install nodejs-lts yt-dlp ffmpeg -y");
    } else {
      throw new Error(`Unsupported Windows dependency manager: ${manager}`);
    }
    lines.push("", "# Restart your MCP client after PATH changes.");
  } else if (targetOs === "macos") {
    if (manager !== "brew") throw new Error(`Unsupported macOS dependency manager: ${manager}`);
    lines.push("brew install node yt-dlp ffmpeg");
  } else {
    if (manager === "apt") {
      lines.push("sudo apt update", "sudo apt install -y ffmpeg pipx", "pipx install yt-dlp");
    } else if (manager === "dnf") {
      lines.push("sudo dnf install -y ffmpeg pipx", "pipx install yt-dlp");
    } else if (manager === "pacman") {
      lines.push("sudo pacman -S --needed ffmpeg yt-dlp");
    } else if (manager === "pipx") {
      lines.push("pipx install yt-dlp", "# Install ffmpeg/ffprobe with your distro package manager.");
    } else {
      throw new Error(`Unsupported Linux dependency manager: ${manager}`);
    }
    lines.push("", "# Linux package managers vary. Ensure `node --version` is >= 20 before using npm/npx mode.");
  }

  if (options.includePackageInstall) {
    lines.push("", "npm install -g yt-dlp-mcp-server", "yt-dlp-mcp-server doctor");
  } else {
    lines.push("", "yt-dlp --version", "ffmpeg -version", "ffprobe -version");
  }

  return lines.join("\n");
}

function renderClientSection(options: PrintConfigOptions): string {
  const launch = buildLaunchConfig(options);
  const title = `# ${clientTitle(options.client)} (${options.mode})`;

  if (options.client === "warp") {
    return `${title}\n${renderWarpConfig(launch)}`;
  }

  if (options.client === "vscode") {
    return `${title}\n${json({
      servers: {
        "yt-dlp": {
          type: "stdio",
          command: launch.command,
          args: launch.args,
          ...(launch.env ? { env: launch.env } : {})
        }
      }
    })}`;
  }

  if (options.client === "codex") {
    return `${title}\n${renderCodexConfig(launch)}`;
  }

  return `${title}\n${json({
    mcpServers: {
      "yt-dlp": {
        command: launch.command,
        args: launch.args,
        ...(launch.env ? { env: launch.env } : {})
      }
    }
  })}`;
}

function buildLaunchConfig(options: PrintConfigOptions): LaunchConfig {
  if (options.mode === "docker") {
    return {
      command: dockerCommand(options.targetOs),
      args: [
        "run",
        "-i",
        "--rm",
        "-v",
        `${options.outputRoot}:/downloads`,
        "-e",
        "YTDLP_MCP_OUTPUT_ROOT=/downloads",
        "-e",
        "YTDLP_MCP_TEMP_ROOT=/tmp/yt-dlp-mcp",
        options.image
      ]
    };
  }

  if (options.mode === "npx") {
    return {
      command: commandName("npx", options.targetOs),
      args: ["-y", options.packageSpec],
      env: { YTDLP_MCP_OUTPUT_ROOT: options.outputRoot }
    };
  }

  if (options.mode === "global") {
    return {
      command: commandName("yt-dlp-mcp-server", options.targetOs),
      args: [],
      env: { YTDLP_MCP_OUTPUT_ROOT: options.outputRoot }
    };
  }

  return {
    command: commandName("node", options.targetOs),
    args: [options.serverPath],
    env: { YTDLP_MCP_OUTPUT_ROOT: options.outputRoot }
  };
}

export function formatDoctorReport(report: EnvironmentReport): {
  ready: boolean;
  status: "ready" | "ready_with_warnings" | "missing_required_dependency";
  text: string;
  suggestions: string[];
} {
  const ytDlp = findDependency(report, "yt-dlp");
  const ffmpeg = findDependency(report, "ffmpeg");
  const ffprobe = findDependency(report, "ffprobe");
  const ready = ytDlp?.status === "available";
  const recommendedReady = ffmpeg?.status === "available" && ffprobe?.status === "available";
  const status = ready ? (recommendedReady ? "ready" : "ready_with_warnings") : "missing_required_dependency";
  const suggestions = installSuggestions(report.platform, ready, recommendedReady);
  const lines = [
    `yt-dlp-mcp-server ${VERSION} doctor`,
    "",
    `Platform: ${report.platform}/${report.arch}`,
    `Node: ${report.node.version} (${report.node.execPath})`,
    "",
    "Required:",
    dependencyLine(ytDlp),
    "",
    "Recommended for downloads/postprocessing:",
    dependencyLine(ffmpeg),
    dependencyLine(ffprobe),
    "",
    "Optional:",
    ...report.dependencies
      .filter((dependency) => !["yt-dlp", "ffmpeg", "ffprobe"].includes(dependency.name))
      .map(dependencyLine),
    "",
    "Policy:",
    `  outputRoot: ${report.policy.outputRoot}`,
    `  tempRoot: ${report.policy.tempRoot}`,
    `  expertMode: ${report.policy.enableExpertMode ? "enabled" : "disabled"}`,
    `  arbitraryPaths: ${report.policy.allowArbitraryOutputPaths ? "enabled" : "disabled"}`,
    "",
    `Result: ${resultText(status)}`,
    "",
    "Suggestions:",
    ...suggestions.map((suggestion) => `  - ${suggestion}`)
  ];

  return {
    ready,
    status,
    text: lines.join("\n"),
    suggestions
  };
}

function parsePrintConfigOptions(argv: string[], cwd: string): PrintConfigOptions {
  const parsed = parseArgs(argv);
  const positionalClient = parsed.positional[0];
  const client = parseClient(flag(parsed, "client") ?? positionalClient ?? "claude");
  const mode = parseMode(flag(parsed, "mode") ?? "docker");
  const targetOs = parseTargetOs(flag(parsed, "os") ?? "current");

  return {
    client,
    mode,
    targetOs,
    outputRoot: flag(parsed, "output-root") ?? defaultOutputRoot(targetOs),
    image: flag(parsed, "image") ?? DOCKER_IMAGE,
    packageSpec: flag(parsed, "package") ?? PACKAGE_SPEC,
    serverPath: flag(parsed, "server-path") ?? path.resolve(cwd, "dist/index.js")
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item?.startsWith("--")) {
      if (item) positional.push(item);
      continue;
    }

    const inline = item.match(/^--([^=]+)=(.*)$/);
    if (inline) {
      flags.set(inline[1], inline[2]);
      continue;
    }

    const name = item.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(name, next);
      index += 1;
    } else {
      flags.set(name, true);
    }
  }

  return { positional, flags };
}

function flag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function parseClient(value: string): ClientName {
  const normalized = value.toLowerCase();
  if (["claude", "cursor", "windsurf", "cline", "vscode", "warp", "codex", "all"].includes(normalized)) {
    return normalized as ClientName;
  }
  throw new Error(`Unsupported client: ${value}`);
}

function parseMode(value: string): InstallMode {
  const normalized = value.toLowerCase();
  if (["docker", "npx", "global", "source"].includes(normalized)) return normalized as InstallMode;
  throw new Error(`Unsupported mode: ${value}`);
}

function parseTargetOs(value: string): TargetOs {
  const normalized = value.toLowerCase();
  if (["current", "macos", "darwin"].includes(normalized)) return normalized === "darwin" ? "macos" : normalized as TargetOs;
  if (["windows", "win32"].includes(normalized)) return "windows";
  if (["linux"].includes(normalized)) return "linux";
  throw new Error(`Unsupported OS: ${value}`);
}

function parseDependencyManager(value: string): DependencyManager {
  const normalized = value.toLowerCase();
  if (["auto", "winget", "scoop", "choco", "brew", "apt", "dnf", "pacman", "pipx"].includes(normalized)) {
    return normalized as DependencyManager;
  }
  throw new Error(`Unsupported dependency manager: ${value}`);
}

function defaultOutputRoot(targetOs: TargetOs): string {
  const effective = targetOs === "current" ? currentTargetOs() : targetOs;
  if (effective === "windows") return "C:\\Users\\YOUR_USER\\Downloads\\yt-dlp-mcp";
  if (effective === "macos") return `${os.homedir().startsWith("/Users/") ? os.homedir() : "/Users/YOUR_USER"}/Downloads/yt-dlp-mcp`;
  return `${os.homedir().startsWith("/home/") ? os.homedir() : "/home/YOUR_USER"}/Downloads/yt-dlp-mcp`;
}

function currentTargetOs(): Exclude<TargetOs, "current"> {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "win32") return "windows";
  return "linux";
}

function commandName(name: string, targetOs: TargetOs): string {
  const effective = targetOs === "current" ? currentTargetOs() : targetOs;
  return effective === "windows" ? `${name}.cmd` : name;
}

function dockerCommand(targetOs: TargetOs): string {
  const effective = targetOs === "current" ? currentTargetOs() : targetOs;
  return effective === "windows" ? "docker.exe" : "docker";
}

function clientTitle(client: ClientName): string {
  const titles: Record<ClientName, string> = {
    claude: "Claude Desktop / common mcpServers clients",
    cursor: "Cursor",
    windsurf: "Windsurf",
    cline: "Cline",
    vscode: "VS Code",
    warp: "Warp",
    codex: "Codex Desktop config.toml",
    all: "All clients"
  };
  return titles[client];
}

function defaultDependencyManager(targetOs: Exclude<TargetOs, "current">): DependencyManager {
  if (targetOs === "windows") return "winget";
  if (targetOs === "macos") return "brew";
  return "apt";
}

function dependencyTitle(targetOs: Exclude<TargetOs, "current">, manager: DependencyManager): string {
  const osTitle = targetOs === "macos" ? "macOS" : targetOs === "windows" ? "Windows" : "Linux";
  return `${osTitle} dependencies (${manager})`;
}

function renderWarpConfig(launch: LaunchConfig): string {
  const lines = [
    "mcp_servers:",
    "  yt-dlp:",
    `    command: ${yamlString(launch.command)}`,
    "    args:",
    ...launch.args.map((arg) => `      - ${yamlString(arg)}`)
  ];
  if (launch.env) {
    lines.push("    env:");
    for (const [key, value] of Object.entries(launch.env)) {
      lines.push(`      ${key}: ${yamlString(value)}`);
    }
  }
  return lines.join("\n");
}

function renderCodexConfig(launch: LaunchConfig): string {
  const lines = [
    "[mcp_servers.yt-dlp]",
    "enabled = true",
    `command = ${tomlString(launch.command)}`,
    `args = [${launch.args.map((arg) => tomlString(arg)).join(", ")}]`
  ];
  if (launch.env) {
    lines.push("", "[mcp_servers.yt-dlp.env]");
    for (const [key, value] of Object.entries(launch.env)) {
      lines.push(`${key} = ${tomlString(value)}`);
    }
  }
  return lines.join("\n");
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function tomlString(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  return JSON.stringify(value);
}

function findDependency(report: EnvironmentReport, name: string): DetectedDependency | undefined {
  return report.dependencies.find((dependency) => dependency.name === name);
}

function dependencyLine(dependency: DetectedDependency | undefined): string {
  if (!dependency) return "  [missing] not reported";
  const version = dependency.version ? ` - ${dependency.version}` : "";
  const notes = dependency.status === "available" ? "" : ` (${dependency.notes.join("; ")})`;
  return `  [${dependency.status}] ${dependency.name}: ${dependency.command}${version}${notes}`;
}

function resultText(status: ReturnType<typeof formatDoctorReport>["status"]): string {
  if (status === "ready") return "ready for local npm/global use and Docker use.";
  if (status === "ready_with_warnings") return "ready for inspect/plan; install ffmpeg/ffprobe or use Docker for dependable downloads.";
  return "not ready for local npm/global use; Docker mode remains the easiest bundled path.";
}

function installSuggestions(platform: NodeJS.Platform, ready: boolean, recommendedReady: boolean): string[] {
  const suggestions = [
    "For casual local setup, run `yt-dlp-mcp-server print-deps` to get OS package-manager commands.",
    "For the bundled reproducible setup, use Docker mode so yt-dlp, ffmpeg, ffprobe, and Deno are included.",
    "Generate a client config with `yt-dlp-mcp-server print-config --client claude --mode npx` or `--mode docker`."
  ];

  if (!ready || !recommendedReady) {
    if (platform === "darwin") {
      suggestions.push("For local npm/global mode on macOS, install dependencies with Homebrew and set explicit binary paths if your MCP client cannot see `/opt/homebrew/bin` or `/usr/local/bin`.");
    } else if (platform === "win32") {
      suggestions.push("For local npm/global mode on Windows, install yt-dlp and FFmpeg binaries, then set `YTDLP_MCP_YTDLP_PATH`, `YTDLP_MCP_FFMPEG_PATH`, and `YTDLP_MCP_FFPROBE_PATH` if they are not on PATH.");
    } else {
      suggestions.push("For local npm/global mode on Linux, install yt-dlp with your Python/package-manager workflow and install ffmpeg/ffprobe with your distro packages.");
    }
  }

  return suggestions;
}

function helpText(): string {
  return [
    `yt-dlp-mcp-server ${VERSION}`,
    "",
    "Usage:",
    "  yt-dlp-mcp-server stdio",
    "  yt-dlp-mcp-server doctor [--json]",
    "  yt-dlp-mcp-server print-deps [--os current|macos|windows|linux] [--manager auto|winget|scoop|choco|brew|apt|dnf|pacman|pipx]",
    "  yt-dlp-mcp-server print-config [client] [--mode docker|npx|global|source] [--os current|macos|windows|linux]",
    "",
    "Commands:",
    "  stdio         Start the MCP stdio server. MCP clients can also launch with no args.",
    "  doctor        Check local yt-dlp, ffmpeg, ffprobe, Deno, paths, and safety policy.",
    "  print-deps    Print OS package-manager commands for Node, yt-dlp, ffmpeg, and ffprobe.",
    "  print-config  Print copy-paste MCP client config for Claude, Cursor, VS Code, Warp, Codex, and others.",
    "",
    "Recommended casual-user path:",
    "  1. Run: yt-dlp-mcp-server print-deps",
    "  2. Run: yt-dlp-mcp-server doctor",
    "  3. Run: yt-dlp-mcp-server print-config --client claude --mode npx",
    "",
    "Reproducible bundled path:",
    "  1. Install Docker Desktop or Docker Engine.",
    "  2. Run: yt-dlp-mcp-server print-config --client claude --mode docker",
    "  3. Paste the config into your MCP client.",
    "",
    "Examples:",
    "  yt-dlp-mcp-server doctor",
    "  yt-dlp-mcp-server print-deps --os windows --manager winget",
    "  yt-dlp-mcp-server print-config --client codex --mode npx --os windows --output-root C:\\\\Users\\\\alex\\\\Downloads\\\\yt-dlp-mcp",
    "  yt-dlp-mcp-server print-config --client all --mode docker --output-root /Users/alex/Downloads/yt-dlp-mcp",
    "  yt-dlp-mcp-server print-config --client vscode --mode npx --os windows --output-root C:\\\\Users\\\\alex\\\\Downloads\\\\yt-dlp-mcp",
    ""
  ].join("\n");
}

function defaultIo(): CliIo {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    cwd: process.cwd()
  };
}
