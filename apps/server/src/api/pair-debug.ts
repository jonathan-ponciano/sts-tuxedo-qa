import { Hono } from "hono";
import { ActionSchema, type PairDebugInputEvent } from "@tuxedo-qa/shared";
import { z } from "zod";
import { getPairDebugContext, resolvePairDebugRunnerSessionId, startPairDebug, stepPairDebug, stopPairDebug } from "../mcp/handlers.ts";
import { runnerClient } from "../runner-client/index.ts";

export const pairDebugRouter = new Hono();

const startSchema = z.object({ url: z.string().url().optional() });
const stepSchema = z.object({ action: ActionSchema });
const inputSchema = z.object({ type: z.string() }).passthrough();

pairDebugRouter.post("/sessions", async (c) => {
  const ctx = c.get("project");
  const parsed = startSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  try {
    const result = await startPairDebug(ctx, parsed.data);
    return c.json(result, 201);
  } catch (err) {
    return c.json({ error: "pair_debug_start_failed", message: (err as Error).message }, 409);
  }
});

pairDebugRouter.get("/sessions/:id", async (c) => {
  const ctx = c.get("project");
  const sessionId = Number(c.req.param("id"));
  try {
    const result = await getPairDebugContext(ctx, { sessionId });
    return c.json(result);
  } catch (err) {
    return c.json({ error: "pair_debug_session_not_found", message: (err as Error).message }, 404);
  }
});

pairDebugRouter.post("/sessions/:id/actions", async (c) => {
  const ctx = c.get("project");
  const sessionId = Number(c.req.param("id"));
  const parsed = stepSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  try {
    const result = await stepPairDebug(ctx, { sessionId, action: parsed.data.action });
    return c.json(result);
  } catch (err) {
    return c.json({ error: "pair_debug_step_failed", message: (err as Error).message }, 409);
  }
});

// Raw passthrough of the runner's SSE stream — screencast has exactly one
// producer per session already (see subscribeScreencast's listener Set), so
// there's no need for an app-side fan-out hub; each browser tab that opens
// this just gets its own upstream connection to the runner.
pairDebugRouter.get("/sessions/:id/screencast", async (c) => {
  const ctx = c.get("project");
  const sessionId = Number(c.req.param("id"));
  let runnerSessionId: string;
  try {
    runnerSessionId = resolvePairDebugRunnerSessionId(ctx, sessionId);
  } catch (err) {
    return c.json({ error: "pair_debug_session_not_found", message: (err as Error).message }, 404);
  }
  const upstream = await fetch(runnerClient.pairDebugScreencastUrl(runnerSessionId));
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
});

pairDebugRouter.post("/sessions/:id/input", async (c) => {
  const ctx = c.get("project");
  const sessionId = Number(c.req.param("id"));
  const parsed = inputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  try {
    const runnerSessionId = resolvePairDebugRunnerSessionId(ctx, sessionId);
    await runnerClient.dispatchPairDebugInput(runnerSessionId, parsed.data as PairDebugInputEvent);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: "pair_debug_input_failed", message: (err as Error).message }, 409);
  }
});

pairDebugRouter.delete("/sessions/:id", async (c) => {
  const ctx = c.get("project");
  const sessionId = Number(c.req.param("id"));
  try {
    const result = await stopPairDebug(ctx, { sessionId });
    return c.json(result);
  } catch (err) {
    return c.json({ error: "pair_debug_stop_failed", message: (err as Error).message }, 404);
  }
});
