import { config } from "../config.ts";
import { resolveProject } from "../db/project-context.ts";
import { listProjects } from "../db/registry.ts";
import { nextDueAtIso } from "../runs/schedule.ts";
import { triggerRun } from "../runs/trigger-run.ts";
import { runnerClient } from "../runner-client/index.ts";
import { refreshProjectStats } from "../streaming/hub.ts";

interface DueTestRow {
  id: number;
  schedule: string;
}

interface ExpiredSandboxRow {
  id: number;
  container_name: string | null;
}

/**
 * Fase 1's sandboxes are provisioned manually (a dashboard button) with no
 * corresponding "stop" guarantee — a user who closes the tab without
 * clicking "parar" would otherwise leak a container/network forever. Piggy-
 * backing on the existing per-project tick (rather than a separate interval)
 * keeps sandbox cleanup on the same cadence as everything else here.
 */
async function reapExpiredSandboxes(ctx: ReturnType<typeof resolveProject>): Promise<void> {
  const expired = ctx.db
    .query("SELECT id, container_name FROM sandbox_environments WHERE status = 'running' AND expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    .all() as ExpiredSandboxRow[];
  for (const sandbox of expired) {
    if (sandbox.container_name) await runnerClient.teardownSandbox(sandbox.container_name);
    ctx.db.run("UPDATE sandbox_environments SET status = 'stopped', stopped_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1", [
      sandbox.id,
    ]);
  }
}

/**
 * Ticks roughly every minute across all registered projects. This is the
 * ONLY caller that filters by the `validated` gate before starting a run —
 * manual/MCP/CI runs go straight to `triggerRun` without this filter, since
 * they're how a test becomes validated in the first place.
 */
async function tick(): Promise<void> {
  for (const projectRow of listProjects()) {
    let ctx: ReturnType<typeof resolveProject>;
    try {
      ctx = resolveProject(projectRow.slug);
    } catch (err) {
      console.error(`[scheduler] failed to resolve project ${projectRow.slug}:`, (err as Error).message);
      continue;
    }

    const pausedUntilRow = ctx.db.query("SELECT value FROM meta WHERE key = 'paused_until'").get() as { value: string } | null;
    const paused = pausedUntilRow ? new Date(pausedUntilRow.value).getTime() > Date.now() : false;

    if (!paused) {
      const due = ctx.db
        .query(
          `SELECT id, schedule FROM tests
           WHERE validated = 1 AND schedule IS NOT NULL AND schedule_enabled = 1
             AND (next_due_at IS NULL OR next_due_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
        )
        .all() as DueTestRow[];

      for (const test of due) {
        try {
          await triggerRun(ctx, { testIds: [test.id], trigger: "scheduled" });
        } catch (err) {
          console.error(`[scheduler] failed to trigger run for test ${test.id} in ${projectRow.slug}:`, (err as Error).message);
        }
        const next = nextDueAtIso(test.schedule);
        ctx.db.run("UPDATE tests SET next_due_at = ?1 WHERE id = ?2", [next, test.id]);
      }
    }

    try {
      await reapExpiredSandboxes(ctx);
    } catch (err) {
      console.error(`[scheduler] sandbox reaper failed for ${projectRow.slug}:`, (err as Error).message);
    }

    refreshProjectStats(ctx);
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (intervalHandle) return;
  void tick().catch((err) => console.error("[scheduler] initial tick failed:", (err as Error).message));
  intervalHandle = setInterval(() => {
    void tick().catch((err) => console.error("[scheduler] tick failed:", (err as Error).message));
  }, config.schedulerIntervalMs);
}

export function stopScheduler(): void {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}
