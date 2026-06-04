# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/antonio-orionus/yt-dlp-mcp-server"
LABEL org.opencontainers.image.description="Dependency-aware local stdio MCP server for yt-dlp"
LABEL io.modelcontextprotocol.server.name="io.github.antonio-orionus/yt-dlp"

ARG PNPM_VERSION=10.34.1
ARG YTDLP_VERSION=2026.03.17

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV DENO_INSTALL=/usr/local
ENV YTDLP_MCP_OUTPUT_ROOT=/downloads
ENV YTDLP_MCP_TEMP_ROOT=/tmp/yt-dlp-mcp
ENV YTDLP_MCP_YTDLP_PATH=yt-dlp
ENV YTDLP_MCP_FFMPEG_PATH=ffmpeg
ENV YTDLP_MCP_FFPROBE_PATH=ffprobe

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 python3-pip unzip \
  && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --break-system-packages --root-user-action=ignore --no-cache-dir "yt-dlp==${YTDLP_VERSION}"
RUN curl -fsSL https://deno.land/install.sh | sh
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build && pnpm prune --prod

RUN mkdir -p /downloads /tmp/yt-dlp-mcp \
  && chmod 0777 /downloads /tmp/yt-dlp-mcp

VOLUME ["/downloads"]
ENTRYPOINT ["node", "dist/index.js"]
