# yt-dlp-mcp-server

<div align="center">

**The production-grade MCP server for yt-dlp — inspect, plan, download, postprocess media URLs for AI agents**

[![npm version](https://img.shields.io/npm/v/yt-dlp-mcp-server.svg)](https://www.npmjs.com/package/yt-dlp-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)

28 typed tools. YouTube/youtu.be aware. Plan before write. Safe execution. Full yt-dlp option truth.

> **MCP server pre-release:** v0.1.1 is ready for early users, but pin versions in production while the public release process stabilizes.

[Quick Start](#quick-start) • [Tools](#tools) • [Usage Examples](#usage-examples) • [Safety Model](#safety-model) • [Docker](#docker)

</div>

---

## Why This One

Most yt-dlp MCP servers are thin wrappers around 5–10 commands. This is a control plane for agents:

| | Other servers | This server |
| --- | --- | --- |
| Tool count | ~10 | 28 typed tools |
| Plan before write | No | `ytdlp_plan_download` explains paths, deps, risks |
| Full option truth | Hardcoded flags | 323 options from upstream `yt_dlp.options.create_parser()` |
| Postprocessing | Basic audio extract | Remux, recode, embed assets, split/remove chapters, SponsorBlock |
| Archive management | None | Inspect archive entries, check exact entries, plan archive-safe downloads |
| Safe execution | Shell strings | argv arrays, `shell: false`, managed output roots, redaction |
| Raw escape hatch | Always on | Expert mode, gated behind env flag |
| Docker | None | Bundled yt-dlp, ffmpeg, ffprobe, Deno |

---

## Quick Start

### Step 1 — Install media tools

| OS | Commands |
| --- | --- |
| **Windows** | `winget install -e --id OpenJS.NodeJS.LTS`<br>`winget install -e --id yt-dlp.yt-dlp` |
| **macOS** | `brew install node yt-dlp ffmpeg` |
| **Ubuntu/Debian** | `sudo apt install -y nodejs ffmpeg pipx && pipx install yt-dlp` |

> **Windows:** `yt-dlp.yt-dlp` installs Deno and `yt-dlp.FFmpeg` as winget dependencies. Restart PowerShell after install so the new command aliases are on `PATH`.

### Step 2 — Add to your MCP client

```json
{
  "mcpServers": {
    "yt-dlp": {
      "command": "npx",
      "args": ["-y", "yt-dlp-mcp-server@latest"],
      "env": {
        "YTDLP_MCP_OUTPUT_ROOT": "/Users/YOUR_USER/Downloads/yt-dlp-mcp"
      }
    }
  }
}
```

> **Windows:** use `"command": "npx.cmd"` instead of `"npx"`.

For Codex Desktop on Windows, use the TOML example in [Client Setup](#client-setup) instead of this JSON shape.

### Step 3 — Verify

Ask your AI assistant: *"Check the yt-dlp environment"* — it will call `ytdlp_check_environment` and report which tools are found.

---

## Client Setup

<details open>
<summary><strong>Claude Desktop / Cursor / Windsurf / Cline</strong></summary>

Use the config from Step 2 above.

Config file locations:
- Claude Desktop macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Desktop Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Cursor: `.cursor/mcp.json` in a project, or global Cursor MCP settings
- Windsurf: `~/.codeium/windsurf/mcp_config.json`
- Cline: extension MCP settings

</details>

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add-json yt-dlp '{"type":"stdio","command":"npx","args":["-y","yt-dlp-mcp-server@latest"],"env":{"YTDLP_MCP_OUTPUT_ROOT":"~/Downloads/yt-dlp-mcp"}}'
```

</details>

<details>
<summary><strong>VS Code</strong></summary>

VS Code requires a `servers` root and `type` field:

```json
{
  "servers": {
    "yt-dlp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "yt-dlp-mcp-server@latest"],
      "env": {
        "YTDLP_MCP_OUTPUT_ROOT": "/Users/YOUR_USER/Downloads/yt-dlp-mcp"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Warp</strong></summary>

```yaml
mcp_servers:
  yt-dlp:
    command: npx
    args:
      - -y
      - yt-dlp-mcp-server@latest
    env:
      YTDLP_MCP_OUTPUT_ROOT: /Users/YOUR_USER/Downloads/yt-dlp-mcp
```

</details>

<details>
<summary><strong>Codex</strong></summary>

Codex Desktop usually reads `config.toml` from:

- Windows: `C:\Users\YOUR_USER\.codex\config.toml`
- macOS/Linux: `~/.codex/config.toml`

```toml
[mcp_servers.yt-dlp]
enabled = true
command = "npx"
args = ["-y", "yt-dlp-mcp-server@latest"]

[mcp_servers.yt-dlp.env]
YTDLP_MCP_OUTPUT_ROOT = "/Users/YOUR_USER/Downloads/yt-dlp-mcp"
```

Windows:

```toml
[mcp_servers.yt-dlp]
enabled = true
command = "npx.cmd"
args = ["-y", "yt-dlp-mcp-server@latest"]

[mcp_servers.yt-dlp.env]
YTDLP_MCP_OUTPUT_ROOT = 'C:\Users\YOUR_USER\Downloads\yt-dlp-mcp'
```

</details>

---

## Docker

Docker bundles everything — yt-dlp, ffmpeg, ffprobe, Deno. No host install required.

```bash
docker build -t yt-dlp-mcp-server:local .
mkdir -p "$HOME/Downloads/yt-dlp-mcp"
```

```json
{
  "mcpServers": {
    "yt-dlp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "/Users/YOUR_USER/Downloads/yt-dlp-mcp:/downloads",
        "-e", "YTDLP_MCP_OUTPUT_ROOT=/downloads",
        "yt-dlp-mcp-server:local"
      ]
    }
  }
}
```

<details>
<summary>Windows Docker config</summary>

```json
{
  "mcpServers": {
    "yt-dlp": {
      "command": "docker.exe",
      "args": [
        "run", "-i", "--rm",
        "-v", "C:\\Users\\YOUR_USER\\Downloads\\yt-dlp-mcp:/downloads",
        "-e", "YTDLP_MCP_OUTPUT_ROOT=/downloads",
        "yt-dlp-mcp-server:local"
      ]
    }
  }
}
```

</details>

---

## Tools

### Environment

| Tool | What it does |
| --- | --- |
| `ytdlp_check_environment` | Check host readiness for yt-dlp, ffmpeg, ffprobe, PATH, cookies, plugins, and policy |
| `ytdlp_list_extractors` | List all supported site extractors from the installed yt-dlp binary |
| `ytdlp_list_impersonation_targets` | List browser impersonation targets for extractor troubleshooting |

### Inspect (read-only, no file writes)

| Tool | What it does |
| --- | --- |
| `ytdlp_search_videos` | Search YouTube without downloading and return compact video results |
| `ytdlp_get_metadata` | Inspect title, duration, uploader, formats, subtitles, thumbnails, and selected best format |
| `ytdlp_list_formats` | List available quality, codec, resolution, bitrate, and format IDs |
| `ytdlp_list_subtitles` | List manual subtitle and automatic caption languages and formats |
| `ytdlp_list_thumbnails` | List thumbnail URLs, resolutions, and poster options |
| `ytdlp_probe_url` | Check URL support and identify the yt-dlp extractor without downloading |

### Agent routing

When the user asks to download or save a media URL, including `youtube.com` and `youtu.be` links, use the download tools rather than trying to download in the model. A request for "best quality" can use the default video format selection, which plans as `bestvideo*+bestaudio/best` unless the user asks for a different format.

### Plan (dry-run, explains before writing)

| Tool | What it does |
| --- | --- |
| `ytdlp_plan_download` | Dry-run a download and show output paths, best-quality format, dependencies, risks, and argv |
| `ytdlp_plan_postprocess` | Dry-run remux, recode, audio extraction, embedding, chapter, and SponsorBlock workflows |
| `ytdlp_validate_options` | Validate typed yt-dlp options and inspect the source-derived option catalog |

### Download

| Tool | What it does |
| --- | --- |
| `ytdlp_download_video` | Download a web video URL, including YouTube and youtu.be links, with best-quality/default format support |
| `ytdlp_download_audio` | Download or extract audio-only output such as MP3, M4A, Opus, WAV, best audio, or podcast/music extraction |
| `ytdlp_download_subtitles` | Download subtitles or captions, including timestamped transcript files, without downloading the video |
| `ytdlp_download_thumbnail` | Download thumbnail, cover image, poster frame, or all thumbnails |
| `ytdlp_download_playlist` | Download playlist/channel entries with ranges, archive skipping, and max-download controls |

### Archive

| Tool | What it does |
| --- | --- |
| `ytdlp_inspect_archive` | List saved entries in a yt-dlp download archive file |
| `ytdlp_check_archive` | Check if an exact yt-dlp archive entry is already present |
| `ytdlp_update_archive` | Plan archive handling and recommend download-archive usage; does not write the archive |

### Download + postprocess

| Tool | What it does |
| --- | --- |
| `ytdlp_remux` | Download a URL and remux to a different container without re-encoding |
| `ytdlp_recode` | Download a URL and re-encode video to a target format |
| `ytdlp_extract_audio` | Download a URL and extract audio as mp3, m4a, opus, etc. |
| `ytdlp_embed_assets` | Download a URL and embed subtitles, thumbnails, metadata, or chapters |
| `ytdlp_split_chapters` | Download a URL and split media into one file per chapter |
| `ytdlp_remove_chapters` | Download a URL and remove chapters matching regex filters |
| `ytdlp_apply_sponsorblock` | Download a URL and remove or mark SponsorBlock segments |

### Expert

| Tool | What it does |
| --- | --- |
| `ytdlp_execute_expert` | Last-resort raw yt-dlp argv escape hatch; requires `YTDLP_MCP_ENABLE_EXPERT=true` |

---

## Usage Examples

### Search and discover

```text
"Search for Python tutorials on YouTube"
"Find the top 10 machine learning videos from this week"
"What formats are available for this video?"
"List all subtitle languages for https://youtube.com/watch?v=..."
```

### Inspect before committing

```text
"What metadata does this video have?"
"Check if this URL is supported"
"List all available formats with their codecs and bitrates"
"Plan a 720p download of this video — what will it create?"
```

### Download

```text
"Download this video in 720p: https://youtube.com/watch?v=..."
"Download just the audio as MP3"
"Download English auto-generated subtitles"
"Download this video from 1:30 to 3:00 only"
"Download playlist items 1–10 and skip ones I've already downloaded"
```

### Postprocess

```text
"Extract MP3 audio from this URL"
"Download this URL and remux it to MP4 without re-encoding"
"Download this URL and embed subtitles and thumbnail"
"Download this URL and split it into chapters"
"Download this URL and remove sponsor segments using SponsorBlock"
```

### Archive management

```text
"Check if this exact archive entry is already in my archive"
"Show me everything in my download archive"
"Plan how to archive-protect this playlist download"
```

---

## Safety Model

| Policy | Behavior |
| --- | --- |
| Process execution | `spawn` with argv arrays, `shell: false` — no shell injection possible |
| Planning | Download and postprocess tools call the planner before writing any file |
| Output roots | All output paths constrained under managed roots by default |
| Archives | Archive paths resolve under output root unless arbitrary paths are enabled |
| Config files | Cookie/browser/netrc sources require `YTDLP_MCP_ALLOW_CONFIG_FILES=true` or server-level env |
| Raw args | Normal tools take typed inputs only; expert mode is gated |
| Redaction | Cookies, PO tokens, auth headers, signed URL params redacted in previews and errors |

---

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `YTDLP_MCP_OUTPUT_ROOT` | `~/Downloads/yt-dlp-mcp` | Managed output directory |
| `YTDLP_MCP_TEMP_ROOT` | OS temp + `yt-dlp-mcp` | Managed temp directory |
| `YTDLP_MCP_YTDLP_PATH` | auto-detected | Override yt-dlp binary path |
| `YTDLP_MCP_FFMPEG_PATH` | auto-detected | Override ffmpeg binary path |
| `YTDLP_MCP_FFPROBE_PATH` | auto-detected | Override ffprobe binary path |
| `YTDLP_MCP_ENABLE_EXPERT` | `false` | Enable `ytdlp_execute_expert` |
| `YTDLP_MCP_ALLOW_ARBITRARY_OUTPUT_PATHS` | `false` | Allow paths outside managed roots |
| `YTDLP_MCP_ALLOW_CONFIG_FILES` | `false` | Allow cookie/netrc/config file inputs |
| `YTDLP_MCP_COOKIES_FILE` | — | Server-approved cookies file |
| `YTDLP_MCP_COOKIES_FROM_BROWSER` | — | Server-approved browser cookie source |
| `YTDLP_MCP_TIMEOUT_MS` | `900000` (15 min) | Per-command timeout |
| `YTDLP_MCP_MAX_OUTPUT_BYTES` | `4194304` (4 MiB) | Max retained stdout/stderr |

If `doctor` reports missing binaries that work in your terminal, set explicit paths:

```json
{
  "YTDLP_MCP_YTDLP_PATH": "/opt/homebrew/bin/yt-dlp",
  "YTDLP_MCP_FFMPEG_PATH": "/opt/homebrew/bin/ffmpeg",
  "YTDLP_MCP_FFPROBE_PATH": "/opt/homebrew/bin/ffprobe"
}
```

Use `/usr/local/bin/...` for Intel Homebrew on macOS. Use absolute `.exe` paths on Windows.

---

## CLI

The `yt-dlp-mcp-server` binary is useful for humans and quiet when launched by an MCP client.

```bash
yt-dlp-mcp-server doctor              # check environment
yt-dlp-mcp-server doctor --json       # machine-readable
yt-dlp-mcp-server print-config --client claude --mode npx
yt-dlp-mcp-server print-config --client codex --mode npx --os windows
yt-dlp-mcp-server print-config --client all --mode docker
yt-dlp-mcp-server print-deps --os macos
yt-dlp-mcp-server print-deps --os windows --manager winget
yt-dlp-mcp-server print-deps --os linux --manager apt
yt-dlp-mcp-server stdio               # start MCP server explicitly
```

Supported `--client` values: `claude`, `cursor`, `windsurf`, `cline`, `vscode`, `warp`, `codex`, `all`.

---

## Resources and Prompts

The server exposes MCP resources and prompt templates:

| Type | Name | Purpose |
| --- | --- | --- |
| Resource | `ytdlp://capabilities` | Tool inventory and capability summary |
| Resource | `ytdlp://option-catalog/groups` | Full 323-option catalog by group |
| Resource | `ytdlp://safety-policy` | Current safety policy settings |
| Resource | `ytdlp://troubleshooting` | Common errors and fixes |
| Resource | `ytdlp://environment` | Live environment check snapshot |
| Prompt | `archive_playlist_safely` | Guided workflow for archive-protected playlist downloads |
| Prompt | `choose_smallest_acceptable_format` | Guided format selection for minimal file size |

---

## Development

```bash
pnpm install
pnpm run validate:ci     # typecheck + tests + build + MCP contract + output audit
pnpm run validate:local  # above + live smoke tests (requires host media tools)
pnpm run validate:release # above + Docker smoke tests
```

MCP Inspector for manual UX check:

```bash
npx -y @modelcontextprotocol/inspector node dist/index.js
```

---

## License

MIT — see [LICENSE](LICENSE).
