import { z } from "zod";

const UnknownRecord = z.record(z.string(), z.unknown());

export const StructuredErrorSchema = z.object({
  kind: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  exitCode: z.number().optional(),
  dependency: z.string().optional(),
  stderrExcerpt: z.string().optional(),
  suggestedFixes: z.array(z.string())
}).passthrough();

export function toolOutput<T extends z.ZodType>(data: T): z.ZodType {
  return z.object({
    ok: z.boolean(),
    data: data.optional(),
    error: StructuredErrorSchema.optional()
  });
}

const DependencySchema = z.object({
  name: z.string(),
  status: z.string(),
  command: z.string().optional(),
  version: z.string().optional(),
  requiredFor: z.array(z.string()),
  notes: z.array(z.string())
}).passthrough();

const PaginationSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    total: z.number(),
    count: z.number(),
    offset: z.number(),
    limit: z.number(),
    hasMore: z.boolean(),
    nextOffset: z.number().optional(),
    items: z.array(item)
  });

const PlanSchema = z.object({
  kind: z.string(),
  args: z.array(z.string()),
  redactedArgs: z.array(z.string()),
  facts: z.object({
    isMediaDownload: z.boolean(),
    output: UnknownRecord.optional(),
    playlistScope: UnknownRecord.optional(),
    effectiveSubtitleFormat: z.string().optional(),
    dependencies: z.object({
      required: z.array(DependencySchema),
      optional: z.array(DependencySchema)
    }).passthrough(),
    risks: z.array(z.string()),
    sideEffects: z.array(z.string())
  }).passthrough()
}).passthrough();

const ProgressEventSchema = z.object({
  phase: z.string(),
  percent: z.number().optional(),
  total: z.string().optional(),
  speed: z.string().optional(),
  eta: z.string().optional(),
  raw: z.string()
}).passthrough();

const FinalPathsSchema = z.object({
  paths: z.array(z.string()),
  stdoutLines: z.array(z.string())
}).passthrough();

const FormatSummarySchema = z.object({
  formatId: z.string(),
  extension: z.string().optional(),
  resolution: z.string().optional(),
  fps: z.number().optional(),
  filesizeApprox: z.string().optional(),
  note: z.string().optional(),
  raw: z.string()
}).passthrough();

const MetadataFormatSchema = z.object({
  formatId: z.string().optional(),
  extension: z.string().optional(),
  protocol: z.string().optional(),
  resolution: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  audioCodec: z.string().optional(),
  videoCodec: z.string().optional(),
  audioBitrate: z.number().optional(),
  videoBitrate: z.number().optional(),
  totalBitrate: z.number().optional(),
  filesize: z.number().optional(),
  filesizeApprox: z.number().optional(),
  formatNote: z.string().optional(),
  dynamicRange: z.string().optional(),
  language: z.string().optional()
}).passthrough();

const MetadataItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  fulltitle: z.string().optional(),
  description: z.string().optional(),
  duration: z.number().optional(),
  durationString: z.string().optional(),
  uploader: z.string().optional(),
  uploaderId: z.string().optional(),
  channel: z.string().optional(),
  channelId: z.string().optional(),
  channelUrl: z.string().optional(),
  webpageUrl: z.string().optional(),
  extractor: z.string().optional(),
  extractorKey: z.string().optional(),
  uploadDate: z.string().optional(),
  timestamp: z.number().optional(),
  availability: z.string().optional(),
  liveStatus: z.string().optional(),
  ageLimit: z.number().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  chapters: z.array(z.unknown()).optional(),
  subtitleCount: z.number().optional(),
  subtitleLanguages: z.array(z.string()).optional(),
  automaticCaptionCount: z.number().optional(),
  automaticCaptionLanguages: z.array(z.string()).optional(),
  thumbnailCount: z.number().optional(),
  formatCount: z.number().optional(),
  formats: z.array(MetadataFormatSchema).optional(),
  selectedFormat: MetadataFormatSchema.optional()
}).passthrough();

const SubtitleSummarySchema = z.object({
  language: z.string(),
  name: z.string().optional(),
  formats: z.array(z.string()),
  source: z.string(),
  raw: z.string()
}).passthrough();

const ThumbnailSummarySchema = z.object({
  id: z.string(),
  url: z.string().optional(),
  resolution: z.string().optional(),
  note: z.string().optional(),
  raw: z.string()
}).passthrough();

const SearchResultSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  webpageUrl: z.string().optional(),
  duration: z.number().optional(),
  durationString: z.string().optional(),
  channel: z.string().optional(),
  channelId: z.string().optional(),
  channelUrl: z.string().optional(),
  uploader: z.string().optional(),
  uploaderId: z.string().optional(),
  viewCount: z.number().optional(),
  liveStatus: z.string().optional(),
  extractor: z.string().optional(),
  extractorKey: z.string().optional(),
  playlistIndex: z.number().optional()
}).passthrough();

export const EnvironmentOutputSchema = toolOutput(
  z.object({
    platform: z.string(),
    arch: z.string(),
    node: UnknownRecord,
    dependencies: z.array(DependencySchema),
    cookies: UnknownRecord,
    policy: UnknownRecord
  }).passthrough()
);

export const ReadOnlyCommandOutputSchema = toolOutput(
  z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    durationMs: z.number()
  }).passthrough()
);

export const MetadataOutputSchema = toolOutput(
  z.object({
    items: PaginationSchema(MetadataItemSchema),
    parseErrors: z.array(z.object({ line: z.string(), message: z.string() })),
    rawBytes: z.number()
  }).passthrough()
);

export const FormatListOutputSchema = toolOutput(
  z.object({
    items: PaginationSchema(FormatSummarySchema),
    rawBytes: z.number()
  }).passthrough()
);

export const SubtitleListOutputSchema = toolOutput(
  z.object({
    items: PaginationSchema(SubtitleSummarySchema),
    rawBytes: z.number()
  }).passthrough()
);

export const ThumbnailListOutputSchema = toolOutput(
  z.object({
    items: PaginationSchema(ThumbnailSummarySchema),
    rawBytes: z.number()
  }).passthrough()
);

export const ProbeOutputSchema = toolOutput(
  z.object({
    supported: z.boolean(),
    items: PaginationSchema(MetadataItemSchema),
    parseErrors: z.array(z.object({ line: z.string(), message: z.string() })),
    rawBytes: z.number()
  }).passthrough()
);

export const SearchOutputSchema = toolOutput(
  z.object({
    query: z.string(),
    source: z.string(),
    items: PaginationSchema(SearchResultSchema),
    parseErrors: z.array(z.object({ line: z.string(), message: z.string() })),
    rawBytes: z.number()
  }).passthrough()
);

export const PlanDownloadOutputSchema = toolOutput(PlanSchema);

export const PlanPostprocessOutputSchema = toolOutput(PlanSchema);

export const ValidateOptionsOutputSchema = toolOutput(
  z.object({
    valid: z.boolean(),
    catalog: z.object({
      source: z.string(),
      ytDlpVersion: z.string(),
      optionCount: z.number(),
      groups: z.array(UnknownRecord)
    }).passthrough(),
    knownLongFlags: z.array(z.string()),
    input: z.unknown()
  }).passthrough()
);

export const ArchiveInspectOutputSchema = toolOutput(
  z.object({
    path: z.string(),
    count: z.number(),
    entries: z.array(z.string()),
    truncated: z.boolean()
  }).passthrough()
);

export const ArchiveCheckOutputSchema = toolOutput(
  z.object({
    path: z.string(),
    entry: z.string().optional(),
    exists: z.boolean(),
    count: z.number()
  }).passthrough()
);

export const ArchiveUpdateOutputSchema = toolOutput(
  z.object({
    path: z.string(),
    entry: z.string().optional(),
    planned: z.boolean(),
    recommendation: z.string()
  }).passthrough()
);

export const DownloadResultOutputSchema = toolOutput(
  z.object({
    dryRun: z.boolean().optional(),
    plan: PlanSchema,
    command: z.string().optional(),
    argv: z.array(z.string()).optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    exitCode: z.number().optional(),
    durationMs: z.number().optional(),
    finalPaths: FinalPathsSchema.optional(),
    progress: z.array(ProgressEventSchema).optional()
  }).passthrough()
);

export const ExpertOutputSchema = toolOutput(
  z.object({
    allowed: z.boolean().optional(),
    reason: z.string().optional(),
    blocked: z.array(z.string()).optional(),
    dryRun: z.boolean().optional(),
    argv: z.array(z.string()).optional(),
    redactedArgv: z.array(z.string()).optional(),
    redactedArgs: z.array(z.string()).optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    exitCode: z.number().optional(),
    durationMs: z.number().optional()
  }).passthrough()
);
