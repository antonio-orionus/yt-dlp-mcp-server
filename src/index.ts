#!/usr/bin/env node

import { runCli } from "./cli.js";

async function main(): Promise<void> {
  const exitCode = await runCli();
  if (exitCode !== 0) process.exit(exitCode);
}

main().catch((error) => {
  console.error("yt-dlp-mcp-server failed to start:", error);
  process.exit(1);
});
