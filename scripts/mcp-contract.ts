import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { asArray, assert, callOk, callTool, defaultTestUrl, isRecord, repoRoot, resetDirectory, scriptSummary, validationRoot, withMcpClient } from "./validation/common.js";

const EXPECTED_TOOLS = [
  "ytdlp_check_environment",
  "ytdlp_list_extractors",
  "ytdlp_list_impersonation_targets",
  "ytdlp_search_videos",
  "ytdlp_get_metadata",
  "ytdlp_list_formats",
  "ytdlp_list_subtitles",
  "ytdlp_list_thumbnails",
  "ytdlp_probe_url",
  "ytdlp_plan_download",
  "ytdlp_plan_postprocess",
  "ytdlp_validate_options",
  "ytdlp_download_video",
  "ytdlp_download_audio",
  "ytdlp_download_subtitles",
  "ytdlp_download_thumbnail",
  "ytdlp_download_playlist",
  "ytdlp_inspect_archive",
  "ytdlp_check_archive",
  "ytdlp_update_archive",
  "ytdlp_remux",
  "ytdlp_recode",
  "ytdlp_extract_audio",
  "ytdlp_embed_assets",
  "ytdlp_split_chapters",
  "ytdlp_remove_chapters",
  "ytdlp_apply_sponsorblock",
  "ytdlp_execute_expert"
] as const;

const EXPECTED_RESOURCES = [
  "ytdlp://capabilities",
  "ytdlp://option-catalog/groups",
  "ytdlp://safety-policy",
  "ytdlp://troubleshooting",
  "ytdlp://environment"
];

const EXPECTED_PROMPTS = ["archive_playlist_safely", "choose_smallest_acceptable_format"];

const READ_ONLY_TOOLS = new Set([
  "ytdlp_check_environment",
  "ytdlp_list_extractors",
  "ytdlp_list_impersonation_targets",
  "ytdlp_search_videos",
  "ytdlp_get_metadata",
  "ytdlp_list_formats",
  "ytdlp_list_subtitles",
  "ytdlp_list_thumbnails",
  "ytdlp_probe_url",
  "ytdlp_plan_download",
  "ytdlp_plan_postprocess",
  "ytdlp_validate_options",
  "ytdlp_inspect_archive",
  "ytdlp_check_archive",
  "ytdlp_update_archive"
]);

const WRITE_TOOLS = EXPECTED_TOOLS.filter((tool) => !READ_ONLY_TOOLS.has(tool));

const outputRoot = path.join(validationRoot, "contract");
const archivePath = path.join(outputRoot, "archive.txt");

await resetDirectory(outputRoot);
await mkdir(path.dirname(archivePath), { recursive: true });
await writeFile(archivePath, "youtube contract-id\n", "utf8");

await withMcpClient({ outputRoot, name: "yt-dlp-mcp-contract" }, async (client) => {
  await client.ping();

  const toolsResult = await client.listTools();
  const tools = toolsResult.tools;
  const toolNames = tools.map((tool) => tool.name).sort();
  assertSameSet(toolNames, [...EXPECTED_TOOLS].sort(), "registered tools");

  for (const tool of tools) {
    assert(typeof tool.description === "string" && tool.description.length > 12, `${tool.name}: missing useful description`);
    assert(isRecord(tool.inputSchema), `${tool.name}: missing inputSchema`);
    assert(isRecord(tool.outputSchema), `${tool.name}: missing outputSchema`);
    assertNonGenericOutputSchema(tool.name, tool.outputSchema);

    const annotations = tool.annotations ?? {};
    if (READ_ONLY_TOOLS.has(tool.name)) {
      assert(annotations.readOnlyHint === true, `${tool.name}: read-only tool must set readOnlyHint=true`);
      assert(annotations.destructiveHint === false, `${tool.name}: read-only tool must set destructiveHint=false`);
    } else {
      assert(annotations.readOnlyHint === false, `${tool.name}: write/expert tool must set readOnlyHint=false`);
    }
  }

  const resources = await client.listResources();
  assertSameSet(resources.resources.map((resource) => resource.uri).sort(), EXPECTED_RESOURCES.sort(), "registered resources");
  for (const uri of EXPECTED_RESOURCES) {
    const result = await client.readResource({ uri });
    assert(result.contents.length > 0, `${uri}: resource returned no contents`);
  }

  const prompts = await client.listPrompts();
  assertSameSet(prompts.prompts.map((prompt) => prompt.name).sort(), EXPECTED_PROMPTS.sort(), "registered prompts");
  const archivePrompt = await client.getPrompt({ name: "archive_playlist_safely", arguments: { url: defaultTestUrl, archivePath } });
  assert(archivePrompt.messages.length > 0, "archive prompt returned no messages");
  const formatPrompt = await client.getPrompt({ name: "choose_smallest_acceptable_format", arguments: { url: defaultTestUrl, maxHeight: "720" } });
  assert(formatPrompt.messages.length > 0, "format prompt returned no messages");

  await callOk(client, "ytdlp_check_environment");
  await callOk(client, "ytdlp_plan_download", { url: defaultTestUrl, kind: "video" });
  await callOk(client, "ytdlp_plan_postprocess", { url: defaultTestUrl, postprocess: { extractAudio: true, audioFormat: "mp3" } });
  await callOk(client, "ytdlp_validate_options", {});
  await callOk(client, "ytdlp_inspect_archive", { archivePath });
  await callOk(client, "ytdlp_check_archive", { archivePath, entry: "youtube contract-id" });
  await callOk(client, "ytdlp_update_archive", { archivePath, entry: "youtube future-id" });

  const expert = await callOk(client, "ytdlp_execute_expert", { args: ["--version"] });
  assert(expert.allowed === false, "expert mode must be disabled by default");

  for (const tool of WRITE_TOOLS.filter((name) => name !== "ytdlp_execute_expert")) {
    const data = await callOk(client, tool, {
      url: defaultTestUrl,
      dryRun: true,
      output: { outputRoot, outputTemplate: `${tool}.%(ext)s`, allowOverwrite: true },
      download: { downloadSections: ["*00:00:00-00:00:01"] },
      subtitles: { writeAutoSubs: true, subFormat: "vtt", subLangs: "en" },
      thumbnails: { writeThumbnail: true },
      postprocess: { audioFormat: "mp3" }
    });
    assert(data.dryRun === true, `${tool}: dryRun call did not return dryRun=true`);
    assert(isRecord(data.plan), `${tool}: dryRun call did not return a plan`);
  }

  const files = await readdir(outputRoot);
  assert(files.every((file) => file === "archive.txt"), `contract dry-run created unexpected files: ${files.join(", ")}`);
});

scriptSummary("mcp-contract", { ok: true, tools: EXPECTED_TOOLS.length, resources: EXPECTED_RESOURCES.length, prompts: EXPECTED_PROMPTS.length });

function assertSameSet(actual: string[], expected: string[], label: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
}

function assertNonGenericOutputSchema(toolName: string, schema: unknown): void {
  assert(isRecord(schema), `${toolName}: output schema must be an object`);
  const properties = schema.properties;
  assert(isRecord(properties), `${toolName}: output schema must define properties`);
  assert(isRecord(properties.ok), `${toolName}: output schema must define ok`);
  assert(isRecord(properties.data), `${toolName}: output schema must define data`);
  assert(schemaHasObjectProperties(properties.data), `${toolName}: outputSchema.data must be a concrete object, not unknown`);
}

function schemaHasObjectProperties(schema: unknown): boolean {
  if (!isRecord(schema)) return false;
  if (isRecord(schema.properties) && Object.keys(schema.properties).length > 0) return true;
  return asArray(schema.anyOf).some(schemaHasObjectProperties) || asArray(schema.oneOf).some(schemaHasObjectProperties) || asArray(schema.allOf).some(schemaHasObjectProperties);
}
