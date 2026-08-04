import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { Action, InspectPageRequest, PairDebugInputEvent, RunRequest } from "@tuxedo-qa/shared";
import { config } from "./config.ts";
import { dispatchInput, startSession, stepSession, stopSession, subscribeScreencast, subscribeSession } from "./pair-debug/session.ts";
import { inspectPage } from "./playwright/inspect.ts";
import { dryRunTest } from "./runs/dry-run.ts";
import { executeRun } from "./runs/execute.ts";
import { subscribe } from "./runs/events.ts";
import { checkSandboxHealth, provisionSandbox, teardownSandbox } from "./sandbox/provision.ts";

const app = new Hono();

app.get("/internal/health", (c) => {
  const browsersReady = existsSync(chromium.executablePath());
  return c.json({ ok: true, browsersReady });
});

const actionSchema = z.object({ type: z.string() }).passthrough();
const inspectSchema = z.object({
  projectSlug: z.string(),
  url: z.string().url(),
  actions: z.array(actionSchema).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

app.post("/internal/inspect-page", async (c) => {
  const parsed = inspectSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  try {
    const result = await inspectPage(parsed.data as InspectPageRequest);
    return c.json(result);
  } catch (err) {
    return c.json({ error: "inspect_failed", message: (err as Error).message }, 502);
  }
});

const dryRunSchema = z.object({
  projectSlug: z.string(),
  specSource: z.string(),
  protectionHeaders: z.record(z.string(), z.string()).optional(),
});

app.post("/internal/tests/dry-run", async (c) => {
  const parsed = dryRunSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const result = await dryRunTest(parsed.data);
  return c.json(result);
});

const runTargetSchema = z.object({ testId: z.number(), fileName: z.string() });
const runRequestSchema = z.object({
  projectSlug: z.string(),
  runId: z.number(),
  targets: z.array(runTargetSchema).optional(),
  headed: z.boolean().optional(),
  protectionHeaders: z.record(z.string(), z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

app.post("/internal/runs", async (c) => {
  const parsed = runRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  void executeRun(parsed.data as RunRequest);
  return c.json({ accepted: true }, 202);
});

app.get("/internal/runs/:runId/events", (c) => {
  const runId = Number(c.req.param("runId"));
  return streamSSE(c, async (stream) => {
    const { replay, isDone, unsubscribe } = subscribe(runId, (event) => {
      void stream.writeSSE({ data: JSON.stringify(event), event: event.kind });
    });
    for (const event of replay) await stream.writeSSE({ data: JSON.stringify(event), event: event.kind });
    stream.onAbort(() => {
      unsubscribe();
    });
    try {
      while (!isDone()) await stream.sleep(500);
    } finally {
      unsubscribe();
    }
  });
});

// Pair-debug: headless browser per session, live preview via CDP screencast
// (see pair-debug/session.ts) rather than an X11/VNC stack — no per-session
// display or port to manage, and multiple sessions run concurrently for free.
const pairDebugStartSchema = z.object({
  projectSlug: z.string(),
  url: z.string().url().optional(),
  protectionHeaders: z.record(z.string(), z.string()).optional(),
});

app.post("/internal/pair-debug/sessions", async (c) => {
  const parsed = pairDebugStartSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  try {
    const result = await startSession(parsed.data.url, parsed.data.protectionHeaders);
    return c.json(result);
  } catch (err) {
    return c.json({ error: "pair_debug_start_failed", message: (err as Error).message }, 409);
  }
});

app.get("/internal/pair-debug/sessions/:id/events", (c) => {
  const sessionId = c.req.param("id");
  return streamSSE(c, async (stream) => {
    let replay: ReturnType<typeof subscribeSession>["replay"];
    let unsubscribe: () => void;
    try {
      ({ replay, unsubscribe } = subscribeSession(sessionId, (event) => {
        void stream.writeSSE({ data: JSON.stringify(event), event: "timeline" });
      }));
    } catch (err) {
      await stream.writeSSE({ data: JSON.stringify({ error: (err as Error).message }), event: "error" });
      return;
    }
    for (const event of replay) await stream.writeSSE({ data: JSON.stringify(event), event: "timeline" });
    stream.onAbort(() => {
      unsubscribe();
    });
    while (!c.req.raw.signal?.aborted) await stream.sleep(1000);
    unsubscribe();
  });
});

// One-shot snapshot (no SSE) — for MCP's get_pair_debug_context, which is a
// plain request/response tool call, not a streaming client.
app.get("/internal/pair-debug/sessions/:id/snapshot", (c) => {
  const sessionId = c.req.param("id");
  try {
    const { replay, unsubscribe } = subscribeSession(sessionId, () => {});
    unsubscribe();
    return c.json({ events: replay });
  } catch (err) {
    return c.json({ error: "pair_debug_session_not_found", message: (err as Error).message }, 404);
  }
});

const pairDebugStepSchema = z.object({ action: actionSchema });

app.post("/internal/pair-debug/sessions/:id/actions", async (c) => {
  const sessionId = c.req.param("id");
  const parsed = pairDebugStepSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  try {
    const result = await stepSession(sessionId, parsed.data.action as Action);
    return c.json(result);
  } catch (err) {
    return c.json({ error: "pair_debug_step_failed", message: (err as Error).message }, 404);
  }
});

app.get("/internal/pair-debug/sessions/:id/screencast", (c) => {
  const sessionId = c.req.param("id");
  return streamSSE(c, async (stream) => {
    let unsubscribe: () => void;
    try {
      ({ unsubscribe } = subscribeScreencast(sessionId, (frameBase64) => {
        void stream.writeSSE({ data: JSON.stringify({ frameBase64 }) });
      }));
    } catch (err) {
      await stream.writeSSE({ data: JSON.stringify({ error: (err as Error).message }), event: "error" });
      return;
    }
    stream.onAbort(() => unsubscribe());
    while (!c.req.raw.signal?.aborted) await stream.sleep(1000);
    unsubscribe();
  });
});

const inputEventSchema = z.object({ type: z.string() }).passthrough();

app.post("/internal/pair-debug/sessions/:id/input", async (c) => {
  const sessionId = c.req.param("id");
  const parsed = inputEventSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  try {
    await dispatchInput(sessionId, parsed.data as PairDebugInputEvent);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: "pair_debug_input_failed", message: (err as Error).message }, 404);
  }
});

app.delete("/internal/pair-debug/sessions/:id", async (c) => {
  const sessionId = c.req.param("id");
  try {
    const result = await stopSession(sessionId);
    return c.json(result);
  } catch (err) {
    return c.json({ error: "pair_debug_stop_failed", message: (err as Error).message }, 404);
  }
});

const provisionSchema = z.object({
  provider: z.enum(["local", "github"]),
  localPath: z.string().optional(),
  remoteUrl: z.string().optional(),
  pat: z.string().optional(),
  branch: z.string(),
  buildMethod: z.enum(["dockerfile", "node"]),
  port: z.number().int().positive(),
});

app.post("/internal/sandbox", async (c) => {
  const parsed = provisionSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  try {
    const result = await provisionSandbox(parsed.data);
    return c.json(result, 201);
  } catch (err) {
    return c.json({ error: "sandbox_provision_failed", message: (err as Error).message }, 502);
  }
});

app.get("/internal/sandbox/:id/health", async (c) => {
  const healthy = await checkSandboxHealth(c.req.param("id"));
  return c.json({ healthy });
});

app.delete("/internal/sandbox/:id", async (c) => {
  await teardownSandbox(c.req.param("id"));
  return c.json({ ok: true });
});

Bun.serve({ port: config.port, fetch: app.fetch, idleTimeout: 0 });
console.log(`tuxedo-qa runner listening on :${config.port} (data dir: ${config.dataDir})`);
