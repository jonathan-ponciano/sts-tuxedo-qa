import type { RunStatus, RunTrigger } from "@tuxedo-qa/shared";
import type { ProjectContext } from "../db/project-context.ts";
import { getEnabledProtectionHeaders } from "../protection/headers.ts";
import { runnerClient } from "../runner-client/index.ts";
import { bridgeRunnerEvents } from "../streaming/hub.ts";

export interface TriggerRunOptions {
  testIds?: number[];
  trigger: RunTrigger;
  maxAttempts?: number;
  attemptNumber?: number;
}

export interface TriggerRunResult {
  runId: number;
  status: RunStatus;
}

const TERMINAL_STATUSES: readonly RunStatus[] = ["passed", "failed", "error", "timeout"];

/** Polls test_runs for a terminal status. Used by run_until_pass, which needs a synchronous outcome to decide whether to retry. */
export async function awaitRunTerminal(
  ctx: ProjectContext,
  runId: number,
  timeoutMs = 120_000,
  pollIntervalMs = 300,
): Promise<{ id: number; status: RunStatus }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = ctx.db.query("SELECT id, status FROM test_runs WHERE id = ?1").get(runId) as
      | { id: number; status: RunStatus }
      | null;
    if (row && TERMINAL_STATUSES.includes(row.status)) return row;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`run ${runId} did not reach a terminal status within ${timeoutMs}ms`);
}

/**
 * The one place that starts a run. Manual dashboard clicks, MCP's
 * `run_tests`/`run_until_pass`, the scheduler, and CI all call this,
 * differing only in `trigger` — and in whether the caller pre-filters by the
 * `validated` gate (only the scheduler's due-test query does; manual/MCP/CI
 * runs are exactly how an unvalidated test becomes validated, so this
 * function itself never checks the flag).
 */
export async function triggerRun(ctx: ProjectContext, opts: TriggerRunOptions): Promise<TriggerRunResult> {
  const singleTestId = opts.testIds?.length === 1 ? opts.testIds[0] : undefined;

  ctx.db.run(
    `INSERT INTO test_runs (test_id, trigger, status, max_attempts, attempt_number) VALUES (?1, ?2, 'queued', ?3, ?4)`,
    [singleTestId ?? null, opts.trigger, opts.maxAttempts ?? 1, opts.attemptNumber ?? 1],
  );
  const { id: runId } = ctx.db.query("SELECT last_insert_rowid() as id").get() as { id: number };

  if (singleTestId !== undefined) {
    ctx.db.run("UPDATE tests SET last_run_id = ?1, last_run_status = 'queued' WHERE id = ?2", [runId, singleTestId]);
  }

  try {
    const targets = opts.testIds?.map((testId) => {
      const row = ctx.db.query("SELECT file_path FROM tests WHERE id = ?1").get(testId) as { file_path: string } | null;
      if (!row) throw new Error(`test ${testId} not found`);
      return { testId, fileName: row.file_path };
    });
    const protectionHeaders = getEnabledProtectionHeaders(ctx);
    await runnerClient.startRun({
      projectSlug: ctx.slug,
      runId,
      targets,
      protectionHeaders: Object.keys(protectionHeaders).length > 0 ? protectionHeaders : undefined,
    });
    ctx.db.run("UPDATE test_runs SET status = 'running' WHERE id = ?1", [runId]);
    if (singleTestId !== undefined) {
      ctx.db.run("UPDATE tests SET last_run_status = 'running' WHERE id = ?1", [singleTestId]);
    }
    // Fire-and-forget: bridges runner's SSE stream for this run into the hub
    // (dashboard fan-out + NDJSON persistence + terminal-status DB update).
    void bridgeRunnerEvents(ctx, runId);
    return { runId, status: "running" };
  } catch (err) {
    ctx.db.run(
      "UPDATE test_runs SET status = 'error', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
      [runId],
    );
    if (singleTestId !== undefined) {
      ctx.db.run("UPDATE tests SET last_run_status = 'error' WHERE id = ?1", [singleTestId]);
    }
    return { runId, status: "error" };
  }
}
