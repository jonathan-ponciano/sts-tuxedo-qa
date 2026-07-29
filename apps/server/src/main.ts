import { existsSync } from "node:fs";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { apiRoute } from "./api/index.ts";
import { config, webDistDir } from "./config.ts";
import { mcpRoute } from "./mcp/route.ts";
import { startScheduler } from "./scheduler/index.ts";

const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true }));
app.route("/mcp", mcpRoute);
app.route("/api", apiRoute);

// Prod only: the SPA build is baked into this image (see apps/server/Dockerfile).
// Registered last so /mcp and /api above always win for their own paths.
if (existsSync(webDistDir)) {
  app.use("/*", serveStatic({ root: webDistDir }));
  // NB: `path` alone joins against the default root "./" (path.join strips a
  // leading slash from an absolute second segment), so this must go through
  // `root` too rather than pass a precomputed absolute path via `path`.
  app.get("*", serveStatic({ root: webDistDir, path: "index.html" }));
}

Bun.serve({ port: config.port, fetch: app.fetch });
startScheduler();
console.log(`tuxedo-qa server listening on :${config.port} (data dir: ${config.dataDir})`);
