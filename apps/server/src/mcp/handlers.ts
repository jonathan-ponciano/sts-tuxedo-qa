import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { ToolInput, ToolOutput } from "@tuxedo-qa/shared";
import type { ProjectContext } from "../db/project-context.ts";
import { encryptSecret } from "../crypto/index.ts";
import { getEnabledProtectionHeaders } from "../protection/headers.ts";
import { runnerClient } from "../runner-client/index.ts";
import { computeNextDueAt } from "../runs/schedule.ts";
import { awaitRunTerminal, triggerRun } from "../runs/trigger-run.ts";
import type { CredentialRow, PairDebugSessionRow, TestRow, TestRunRow } from "./rows.ts";

function slugifyFileName(name: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "test"}.spec.ts`;
}

function toSummary(row: TestRow): ToolOutput<"list_tests">["tests"][number] {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: JSON.parse(row.tags) as string[],
    validated: Boolean(row.validated),
    schedule: row.schedule,
    lastRunStatus: (row.last_run_status as never) ?? null,
    lastRunAt: row.last_run_at ?? null,
  };
}

const TEST_JOIN = `
  SELECT t.*, r.started_at as last_run_at
  FROM tests t
  LEFT JOIN test_runs r ON r.id = t.last_run_id
`;

export async function inspectPage(ctx: ProjectContext, input: ToolInput<"inspect_page">): Promise<ToolOutput<"inspect_page">> {
  // Stored protection headers apply automatically (that's the point of storing them
  // centrally); explicit `input.headers` from the AI take precedence on key clashes.
  const stored = getEnabledProtectionHeaders(ctx);
  return runnerClient.inspectPage({
    projectSlug: ctx.slug,
    url: input.url,
    actions: input.actions,
    headers: { ...stored, ...input.headers },
  });
}

export async function createTest(ctx: ProjectContext, input: ToolInput<"create_test">): Promise<ToolOutput<"create_test">> {
  const fileName = slugifyFileName(input.name);
  writeFileSync(join(ctx.specsDir, fileName), input.script, "utf8");

  let dryRun: ToolOutput<"create_test">["dryRun"];
  try {
    const protectionHeaders = getEnabledProtectionHeaders(ctx);
    const result = await runnerClient.dryRunTest({
      projectSlug: ctx.slug,
      specSource: input.script,
      protectionHeaders: Object.keys(protectionHeaders).length > 0 ? protectionHeaders : undefined,
    });
    dryRun = { ok: result.valid && result.executedOk, errors: result.errors };
  } catch (err) {
    dryRun = { ok: false, errors: [`runner unreachable: ${(err as Error).message}`] };
  }

  const nextDueAt = input.schedule ? computeNextDueAt(input.schedule, null, null) : null;
  ctx.db.run(
    `INSERT INTO tests (name, file_path, description, tags, validated, schedule, next_due_at, created_by)
     VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, 'ai')`,
    [input.name, fileName, input.description ?? null, JSON.stringify(input.tags ?? []), input.schedule ?? null, nextDueAt],
  );
  const { id } = ctx.db.query("SELECT last_insert_rowid() as id").get() as { id: number };

  return { testId: id, validated: false, dryRun };
}

export function listTests(ctx: ProjectContext, input: ToolInput<"list_tests">): ToolOutput<"list_tests"> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (input.validated !== undefined) {
    params.push(input.validated ? 1 : 0);
    clauses.push(`t.validated = ?${params.length}`);
  }
  if (input.tag) {
    params.push(`%"${input.tag}"%`);
    clauses.push(`t.tags LIKE ?${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = ctx.db.query(`${TEST_JOIN} ${where} ORDER BY t.name`).all(...(params as never[])) as TestRow[];
  return { tests: rows.map(toSummary) };
}

function readTestRow(ctx: ProjectContext, testId: number): TestRow {
  const row = ctx.db.query(`${TEST_JOIN} WHERE t.id = ?1`).get(testId) as TestRow | null;
  if (!row) throw new Error(`test ${testId} not found`);
  return row;
}

function toDetail(ctx: ProjectContext, row: TestRow): ToolOutput<"read_test"> {
  const path = join(ctx.specsDir, row.file_path);
  const script = existsSync(path) ? readFileSync(path, "utf8") : "";
  return {
    ...toSummary(row),
    filePath: row.file_path,
    script,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function readTest(ctx: ProjectContext, input: ToolInput<"read_test">): ToolOutput<"read_test"> {
  return toDetail(ctx, readTestRow(ctx, input.testId));
}

export function updateTest(ctx: ProjectContext, input: ToolInput<"update_test">): ToolOutput<"update_test"> {
  const row = readTestRow(ctx, input.testId);
  const name = input.name ?? row.name;
  const description = input.description ?? row.description;
  const schedule = input.schedule === undefined ? row.schedule : input.schedule;
  const nextDueAt = computeNextDueAt(input.schedule, row.schedule, row.next_due_at);
  const tags = input.tags ? JSON.stringify(input.tags) : row.tags;

  if (input.script !== undefined) {
    writeFileSync(join(ctx.specsDir, row.file_path), input.script, "utf8");
  }

  ctx.db.run(
    `UPDATE tests SET name = ?1, description = ?2, schedule = ?3, next_due_at = ?4, tags = ?5,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?6`,
    [name, description, schedule, nextDueAt, tags, input.testId],
  );
  return toDetail(ctx, readTestRow(ctx, input.testId));
}

export async function runTests(ctx: ProjectContext, input: ToolInput<"run_tests">): Promise<ToolOutput<"run_tests">> {
  const testIds = input.testId !== undefined ? [input.testId] : undefined;
  return triggerRun(ctx, { testIds, trigger: "manual" });
}

export function deleteTest(ctx: ProjectContext, input: ToolInput<"delete_test">): ToolOutput<"delete_test"> {
  const row = readTestRow(ctx, input.testId);
  const specPath = join(ctx.specsDir, row.file_path);
  if (existsSync(specPath)) unlinkSync(specPath);
  // test_runs rows cascade via the FK (ON DELETE CASCADE in migrations/project/0001_init.sql)
  ctx.db.run("DELETE FROM tests WHERE id = ?1", [input.testId]);
  return { deleted: true };
}

export async function runUntilPass(ctx: ProjectContext, input: ToolInput<"run_until_pass">): Promise<ToolOutput<"run_until_pass">> {
  let last: { runId: number; status: ToolOutput<"run_until_pass">["status"] } | null = null;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= input.maxAttempts; attempt++) {
    attemptsMade = attempt;
    const { runId, status: startStatus } = await triggerRun(ctx, {
      testIds: [input.testId],
      trigger: "run_until_pass",
      maxAttempts: input.maxAttempts,
      attemptNumber: attempt,
    });

    if (startStatus === "error") {
      last = { runId, status: "error" };
      break;
    }

    const finalRow = await awaitRunTerminal(ctx, runId);
    last = { runId, status: finalRow.status as ToolOutput<"run_until_pass">["status"] };
    if (finalRow.status === "passed") break;
  }

  if (!last) throw new Error("run_until_pass: maxAttempts must be at least 1");
  return { runId: last.runId, attempts: attemptsMade, status: last.status };
}

export function pauseTests(ctx: ProjectContext, input: ToolInput<"pause_tests">): ToolOutput<"pause_tests"> {
  const pausedUntil = new Date(Date.now() + input.minutes * 60_000).toISOString();
  ctx.db.run(
    "INSERT INTO meta (key, value) VALUES ('paused_until', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [pausedUntil],
  );
  return { pausedUntil };
}

export function getStatus(ctx: ProjectContext, input: ToolInput<"get_status">): ToolOutput<"get_status"> {
  if (input.testId !== undefined) {
    const row = readTestRow(ctx, input.testId);
    const lastRun = row.last_run_id
      ? (ctx.db.query("SELECT * FROM test_runs WHERE id = ?1").get(row.last_run_id) as TestRunRow | null)
      : null;
    const status = (row.last_run_status as never) ?? null;
    const diagnosis = lastRun?.status === "failed" || lastRun?.status === "error"
      ? `Last run (${lastRun.id}) ended as ${lastRun.status}. Check artifacts at ${lastRun.artifacts_path ?? "n/a"}.`
      : null;
    return {
      testId: input.testId,
      status,
      diagnosis,
      suggestion: diagnosis ? "Re-read the test with read_test, compare against inspect_page output, and update_test with a fix." : null,
    };
  }

  const counts = ctx.db
    .query("SELECT COUNT(*) as total, SUM(last_run_status = 'passed') as passing, SUM(last_run_status = 'failed') as failing FROM tests")
    .get() as { total: number; passing: number | null; failing: number | null };

  return {
    testId: null,
    status: null,
    diagnosis: null,
    suggestion: null,
    suiteSummary: { total: counts.total, passing: counts.passing ?? 0, failing: counts.failing ?? 0 },
  };
}

export function requestCredential(ctx: ProjectContext, input: ToolInput<"request_credential">): ToolOutput<"request_credential"> {
  const existing = ctx.db.query("SELECT id, status FROM credentials WHERE name = ?1").get(input.name) as
    | Pick<CredentialRow, "id" | "status">
    | null;
  if (existing) {
    if (existing.status === "fulfilled") {
      throw new Error(`credential "${input.name}" already exists and is fulfilled; use a different name`);
    }
    return { credentialId: existing.id, status: "pending" };
  }
  ctx.db.run(
    "INSERT INTO credentials (name, description, status) VALUES (?1, ?2, 'pending')",
    [input.name, input.description ?? null],
  );
  const { id } = ctx.db.query("SELECT last_insert_rowid() as id").get() as { id: number };
  return { credentialId: id, status: "pending" };
}

export function listCredentials(ctx: ProjectContext): ToolOutput<"list_credentials"> {
  const rows = ctx.db
    .query("SELECT id, name, description, status FROM credentials ORDER BY name")
    .all() as Array<Pick<CredentialRow, "id" | "name" | "description" | "status">>;
  return { credentials: rows };
}

/**
 * For values the user already pasted into the conversation themselves —
 * unlike request_credential, this one DOES carry a plaintext value through
 * the MCP boundary, by the user's own choice, not the default flow.
 */
export function createCredential(ctx: ProjectContext, input: ToolInput<"create_credential">): ToolOutput<"create_credential"> {
  const blob = encryptSecret(input.value);
  const existing = ctx.db.query("SELECT id FROM credentials WHERE name = ?1").get(input.name) as { id: number } | null;

  if (existing) {
    ctx.db.run(
      `UPDATE credentials SET secret_blob = ?1, description = ?2, status = 'fulfilled',
         fulfilled_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?3`,
      [blob, input.description ?? null, existing.id],
    );
    return { credentialId: existing.id, status: "fulfilled" };
  }

  ctx.db.run(
    "INSERT INTO credentials (name, description, secret_blob, status, fulfilled_at) VALUES (?1, ?2, ?3, 'fulfilled', strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    [input.name, input.description ?? null, blob],
  );
  const { id } = ctx.db.query("SELECT last_insert_rowid() as id").get() as { id: number };
  return { credentialId: id, status: "fulfilled" };
}

export function deleteCredential(ctx: ProjectContext, input: ToolInput<"delete_credential">): ToolOutput<"delete_credential"> {
  const { changes } = ctx.db.run("DELETE FROM credentials WHERE id = ?1", [input.credentialId]);
  if (changes === 0) throw new Error(`credential ${input.credentialId} not found`);
  return { deleted: true };
}

/**
 * "set" (not "add") — upserts on (kind, url) so calling this again to tweak
 * events or re-enable a webhook updates the existing row instead of stacking
 * a second active one that would double-fire every notification.
 */
export function setWebhook(ctx: ProjectContext, input: ToolInput<"set_webhook">): ToolOutput<"set_webhook"> {
  const existing = ctx.db.query("SELECT id FROM webhooks WHERE kind = ?1 AND url = ?2").get(input.kind, input.url) as
    | { id: number }
    | null;
  if (existing) {
    ctx.db.run("UPDATE webhooks SET events = ?1, enabled = 1 WHERE id = ?2", [JSON.stringify(input.events), existing.id]);
    return { webhookId: existing.id };
  }
  const { lastInsertRowid } = ctx.db.run(
    "INSERT INTO webhooks (kind, url, events) VALUES (?1, ?2, ?3)",
    [input.kind, input.url, JSON.stringify(input.events)],
  );
  return { webhookId: Number(lastInsertRowid) };
}

function readPairDebugSession(ctx: ProjectContext, sessionId: number): PairDebugSessionRow {
  const row = ctx.db.query("SELECT * FROM pair_debug_sessions WHERE id = ?1").get(sessionId) as PairDebugSessionRow | null;
  if (!row) throw new Error(`pair-debug session ${sessionId} not found`);
  return row;
}

export async function startPairDebug(ctx: ProjectContext, input: ToolInput<"start_pair_debug">): Promise<ToolOutput<"start_pair_debug">> {
  const protectionHeaders = getEnabledProtectionHeaders(ctx);
  const { sessionId: runnerSessionId } = await runnerClient.startPairDebug({
    projectSlug: ctx.slug,
    url: input.url,
    protectionHeaders: Object.keys(protectionHeaders).length > 0 ? protectionHeaders : undefined,
  });
  const { lastInsertRowid } = ctx.db.run(
    "INSERT INTO pair_debug_sessions (status, runner_session_id) VALUES ('active', ?1)",
    [runnerSessionId],
  );
  return { sessionId: Number(lastInsertRowid) };
}

/** Resolves the runner-side session id a REST caller needs for screencast/input, which aren't MCP tools (they're human-only, browser-driven concepts). */
export function resolvePairDebugRunnerSessionId(ctx: ProjectContext, sessionId: number): string {
  const row = readPairDebugSession(ctx, sessionId);
  if (!row.runner_session_id) throw new Error(`pair-debug session ${sessionId} has no active runner session`);
  return row.runner_session_id;
}

export async function getPairDebugContext(ctx: ProjectContext, input: ToolInput<"get_pair_debug_context">): Promise<ToolOutput<"get_pair_debug_context">> {
  const row = readPairDebugSession(ctx, input.sessionId);
  if (!row.runner_session_id) return { events: [] };
  const { events } = await runnerClient.getPairDebugSnapshot(row.runner_session_id);
  return { events };
}

export async function stepPairDebug(ctx: ProjectContext, input: ToolInput<"step_pair_debug">): Promise<ToolOutput<"step_pair_debug">> {
  const row = readPairDebugSession(ctx, input.sessionId);
  if (!row.runner_session_id) throw new Error(`pair-debug session ${input.sessionId} has no active runner session`);
  return runnerClient.stepPairDebug(row.runner_session_id, input.action);
}

export async function stopPairDebug(ctx: ProjectContext, input: ToolInput<"stop_pair_debug">): Promise<ToolOutput<"stop_pair_debug">> {
  const row = readPairDebugSession(ctx, input.sessionId);
  if (!row.runner_session_id) throw new Error(`pair-debug session ${input.sessionId} has no active runner session`);

  const { draftTestSource, events } = await runnerClient.stopPairDebug(row.runner_session_id);

  ctx.db.transaction(() => {
    ctx.db.run(
      "UPDATE pair_debug_sessions SET status = 'stopped', stopped_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
      [input.sessionId],
    );
    for (const event of events) {
      ctx.db.run(
        "INSERT INTO pair_debug_events (session_id, seq, ts, type, payload) VALUES (?1, ?2, ?3, ?4, ?5)",
        [input.sessionId, event.seq, event.ts, event.type, JSON.stringify(event.payload)],
      );
    }
  })();

  return { draftTestSource, events };
}
