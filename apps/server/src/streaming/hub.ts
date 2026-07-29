import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { RunProgressEvent } from "@tuxedo-qa/shared";
import type { ProjectContext } from "../db/project-context.ts";
import { updateProjectStats } from "../db/registry.ts";
import { runnerClient } from "../runner-client/index.ts";

type Listener = (event: RunProgressEvent) => void;

interface RunBuffer {
  events: RunProgressEvent[];
  done: boolean;
}

const subscribers = new Map<number, Set<Listener>>();
/**
 * Buffered events per run, so a dashboard tab that opens its SSE connection
 * AFTER a fast run has already finished (common — a 2-3s run can complete
 * before the browser's EventSource handshake lands) still sees the full
 * timeline via replay, instead of hanging on "waiting for events" forever.
 */
const buffers = new Map<number, RunBuffer>();
/** Active-run registry for the Monitor page — in-memory only, per plan section B. */
const activeRunsBySlug = new Map<string, Set<number>>();

function getOrCreateBuffer(runId: number): RunBuffer {
  let buf = buffers.get(runId);
  if (!buf) {
    buf = { events: [], done: false };
    buffers.set(runId, buf);
  }
  return buf;
}

export function subscribeToRunEvents(runId: number, listener: Listener) {
  const buf = getOrCreateBuffer(runId);
  let set = subscribers.get(runId);
  if (!set) {
    set = new Set();
    subscribers.set(runId, set);
  }
  set.add(listener);
  return {
    replay: [...buf.events],
    isDone: () => buf.done,
    unsubscribe: () => {
      set?.delete(listener);
      if (set?.size === 0) subscribers.delete(runId);
    },
  };
}

function broadcast(runId: number, event: RunProgressEvent): void {
  const buf = getOrCreateBuffer(runId);
  buf.events.push(event);
  if (event.kind === "status") buf.done = true;
  for (const listener of subscribers.get(runId) ?? []) listener(event);
}

function scheduleBufferCleanup(runId: number, delayMs = 5 * 60_000): void {
  setTimeout(() => buffers.delete(runId), delayMs);
}

export function getActiveRunCount(slug: string): number {
  return activeRunsBySlug.get(slug)?.size ?? 0;
}

function markActive(slug: string, runId: number): void {
  let set = activeRunsBySlug.get(slug);
  if (!set) {
    set = new Set();
    activeRunsBySlug.set(slug, set);
  }
  set.add(runId);
}

function markInactive(slug: string, runId: number): void {
  activeRunsBySlug.get(slug)?.delete(runId);
}

function appendNdjson(ctx: ProjectContext, runId: number, event: RunProgressEvent): void {
  const dir = join(ctx.artifactsDir, "runs", String(runId));
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "log.ndjson"), `${JSON.stringify(event)}\n`, "utf8");
}

export function refreshProjectStats(ctx: ProjectContext): void {
  const row = ctx.db
    .query("SELECT COUNT(*) as total, SUM(last_run_status = 'passed') as passing, SUM(last_run_status = 'failed') as failing FROM tests")
    .get() as { total: number; passing: number | null; failing: number | null };
  const last = ctx.db.query("SELECT started_at FROM test_runs ORDER BY started_at DESC LIMIT 1").get() as
    | { started_at: string }
    | null;
  updateProjectStats(ctx.id, {
    testCount: row.total,
    passingCount: row.passing ?? 0,
    failingCount: row.failing ?? 0,
    lastRunAt: last?.started_at ?? null,
  });
}

type TerminalStatus = "passed" | "failed" | "error" | "timeout";
const TERMINAL_STATUSES: readonly TerminalStatus[] = ["passed", "failed", "error", "timeout"];
function isTerminalStatus(status: string): status is TerminalStatus {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * Consumes the runner's SSE stream for one run, fanning events out to
 * dashboard subscribers, persisting to NDJSON, and applying the terminal
 * status to the DB (including flipping `validated` on a first real pass).
 * Fire-and-forget from `triggerRun`; failures here just leave the run
 * whatever status it last reached (heartbeat-based staleness detection is a
 * follow-up, see plan risk #5).
 */
export async function bridgeRunnerEvents(ctx: ProjectContext, runId: number): Promise<void> {
  markActive(ctx.slug, runId);
  try {
    const res = await fetch(runnerClient.runEventsUrl(runId));
    if (!res.ok || !res.body) throw new Error(`runner run-events stream failed: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const event = JSON.parse(dataLine.slice(5).trim()) as RunProgressEvent;

        broadcast(runId, event);
        appendNdjson(ctx, runId, event);

        if (event.kind === "status" && isTerminalStatus(event.status)) {
          applyTerminalStatus(ctx, runId, event.status);
          markInactive(ctx.slug, runId);
          scheduleBufferCleanup(runId);
        }
      }
    }
  } catch (err) {
    console.error(`[run ${runId}] event bridge failed:`, (err as Error).message);
  } finally {
    markInactive(ctx.slug, runId);
  }
}

/**
 * The one place that finalizes a run's terminal status — DB update, `tests`
 * row sync, stats refresh, and webhook dispatch. Called both from the normal
 * SSE-bridging path above (a run that actually reached the runner) and
 * directly from trigger-run.ts's catch block (a run that never made it out
 * of `app`, e.g. runner unreachable) so "error" webhooks fire for THAT case
 * too, not just runner-reported failures.
 */
export function applyTerminalStatus(ctx: ProjectContext, runId: number, status: TerminalStatus): void {
  const run = ctx.db.query("SELECT test_id, started_at FROM test_runs WHERE id = ?1").get(runId) as
    | { test_id: number | null; started_at: string }
    | null;
  if (!run) return;

  ctx.db.run(
    `UPDATE test_runs SET status = ?1, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       duration_ms = CAST((julianday(strftime('%Y-%m-%dT%H:%M:%fZ','now')) - julianday(started_at)) * 86400000 AS INTEGER)
     WHERE id = ?2`,
    [status, runId],
  );

  if (run.test_id !== null) {
    ctx.db.run("UPDATE tests SET last_run_status = ?1 WHERE id = ?2", [status, run.test_id]);
    if (status === "passed") {
      ctx.db.run("UPDATE tests SET validated = 1 WHERE id = ?1", [run.test_id]);
    }
  }

  refreshProjectStats(ctx);
  void fireWebhooks(ctx, runId, status);
}

interface WebhookRow {
  id: number;
  kind: "discord" | "slack" | "generic";
  url: string;
  events: string;
}

function webhookBody(kind: WebhookRow["kind"], slug: string, runId: number, status: TerminalStatus): unknown {
  const line = `tuxedo-qa: run #${runId} on "${slug}" -> ${status}`;
  if (kind === "discord") return { content: line };
  if (kind === "slack") return { text: line };
  return { slug, runId, status };
}

const WEBHOOK_DELIVERY_TIMEOUT_MS = 5_000;

/**
 * "timeout" has no dedicated entry in the tool schema's events enum
 * (pass/fail/error) — folded into "error" here since a run that never
 * finished is an infra condition, not a failed assertion.
 */
function webhookCategory(status: TerminalStatus): "pass" | "fail" | "error" {
  if (status === "passed") return "pass";
  if (status === "failed") return "fail";
  return "error";
}

/** Fire-and-forget: a slow or dead webhook endpoint must never block finishing a run. */
async function fireWebhooks(ctx: ProjectContext, runId: number, status: TerminalStatus): Promise<void> {
  const category = webhookCategory(status);
  const rows = ctx.db.query("SELECT id, kind, url, events FROM webhooks WHERE enabled = 1").all() as WebhookRow[];

  for (const row of rows) {
    const events = JSON.parse(row.events) as string[];
    if (!events.includes(category)) continue;

    fetch(row.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(webhookBody(row.kind, ctx.slug, runId, status)),
      signal: AbortSignal.timeout(WEBHOOK_DELIVERY_TIMEOUT_MS),
    }).catch((err) => console.error(`[webhook ${row.id}] delivery failed:`, (err as Error).message));
  }
}
