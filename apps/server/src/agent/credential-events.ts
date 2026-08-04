import type { ProjectContext } from "../db/project-context.ts";
import { runAgentTurn } from "./agent-loop.ts";

interface WaitingRunRow {
  id: number;
  thread_id: number;
}

/**
 * Called right after a credential's PATCH .../fulfill succeeds (see
 * api/credentials.ts) — finds any agent run parked waiting on this exact
 * credential and resumes its thread with a synthetic confirmation turn. The
 * model only ever sees "the credential was provided", never the value
 * itself — that already went straight from the dashboard form to
 * `encryptSecret`, bypassing the chat message pipeline entirely.
 */
export function resumeAgentRunsWaitingOnCredential(ctx: ProjectContext, credentialId: number): void {
  const waiting = ctx.db
    .query("SELECT id, thread_id FROM agent_runs WHERE status = 'waiting_input' AND waiting_on_credential_id = ?1")
    .all(credentialId) as WaitingRunRow[];

  for (const run of waiting) {
    ctx.db.run(
      "UPDATE agent_runs SET status = 'completed', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
      [run.id],
    );
    void runAgentTurn(ctx, run.thread_id, "(a credencial solicitada foi fornecida — pode continuar)").catch((err) => {
      console.error(`failed to resume thread ${run.thread_id} after credential fulfill:`, err);
    });
  }
}
