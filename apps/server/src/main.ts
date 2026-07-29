import { existsSync } from "node:fs";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { apiRoute } from "./api/index.ts";
import { config, webDistDir } from "./config.ts";
import { mcpRoute } from "./mcp/route.ts";
import { proxyNovncHttp, runnerVncWsUrl } from "./proxy/novnc.ts";
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

const VNC_PROXY_RE = /^\/api\/projects\/[^/]+\/pair-debug\/vnc(\/.*)?$/;

interface VncSocketData {
  suffixPath: string;
}

/** Outbound WS to the runner's websockify, keyed by the browser's (already-upgraded) socket. */
const upstreams = new WeakMap<
  { readyState: number },
  { socket: WebSocket; queue: Array<string | ArrayBuffer | Uint8Array> }
>();

const server = Bun.serve<VncSocketData>({
  port: config.port,
  idleTimeout: 0,
  async fetch(req, srv) {
    const url = new URL(req.url);
    const match = VNC_PROXY_RE.exec(url.pathname);
    if (match) {
      const suffixPath = (match[1] || "/") + (url.search || "");
      if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const upgraded = srv.upgrade(req, { data: { suffixPath } });
        return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
      }
      return proxyNovncHttp(req, suffixPath);
    }
    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      const upstream = new WebSocket(runnerVncWsUrl(ws.data.suffixPath));
      upstream.binaryType = "arraybuffer";
      const state = { socket: upstream, queue: [] as Array<string | ArrayBuffer | Uint8Array> };
      upstreams.set(ws, state);

      upstream.addEventListener("open", () => {
        for (const msg of state.queue.splice(0)) upstream.send(msg as never);
      });
      upstream.addEventListener("message", (ev) => {
        ws.send(ev.data as string | ArrayBuffer);
      });
      upstream.addEventListener("close", () => ws.close());
      upstream.addEventListener("error", () => ws.close());
    },
    message(ws, message) {
      const state = upstreams.get(ws);
      if (!state) return;
      if (state.socket.readyState === WebSocket.OPEN) state.socket.send(message as never);
      else state.queue.push(message);
    },
    close(ws) {
      upstreams.get(ws)?.socket.close();
      upstreams.delete(ws);
    },
  },
});

startScheduler();
console.log(`tuxedo-qa server listening on :${server.port} (data dir: ${config.dataDir})`);
