import { chmodSync } from "node:fs";

chmodSync(process.argv[2] ?? "dist/index.js", 0o755);
