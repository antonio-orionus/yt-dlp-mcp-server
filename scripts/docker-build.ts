import { scriptSummary } from "./validation/common.js";
import { buildDockerImage } from "./validation/run.js";

const image = process.env.YTDLP_MCP_DOCKER_IMAGE ?? "yt-dlp-mcp-server:validation";

buildDockerImage(image);
scriptSummary("docker-build", { ok: true, image });
