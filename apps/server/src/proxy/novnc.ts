import { config } from "../config.ts";

/**
 * noVNC/websockify listens on the runner's port 6080, separate from its
 * internal API port (4000). Only `app` reaches this — the runner has no
 * published ports, so this proxy is the only way a browser ever sees the
 * VNC stream. Path doesn't matter to websockify's single-target proxying
 * (see apps/runner/entrypoint.sh); it's preserved here only so the URL stays
 * meaningful in logs.
 */
function runnerVncHostPort(): { hostname: string; port: number } {
  const url = new URL(config.runnerBaseUrl);
  return { hostname: url.hostname, port: 6080 };
}

export function runnerVncWsUrl(suffixPath: string): string {
  const { hostname, port } = runnerVncHostPort();
  return `ws://${hostname}:${port}${suffixPath}`;
}

/** Plain HTTP passthrough for noVNC's static assets (vnc.html, app/*, core/*). */
export async function proxyNovncHttp(req: Request, suffixPath: string): Promise<Response> {
  const { hostname, port } = runnerVncHostPort();
  const target = `http://${hostname}:${port}${suffixPath}`;
  const upstream = await fetch(target, { method: req.method, headers: req.headers });
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}
