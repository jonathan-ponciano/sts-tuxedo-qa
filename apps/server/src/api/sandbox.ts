import { Hono } from "hono";
import type { SandboxEnvironmentDTO } from "@tuxedo-qa/shared";
import { decryptSecret } from "../crypto/index.ts";
import { findRepoLinkForProject, findRepoPatBlob } from "../db/registry.ts";
import type { SandboxRow } from "../mcp/rows.ts";
import { runnerClient } from "../runner-client/index.ts";

export const sandboxRouter = new Hono();

// v1: manual provisioning only (a dashboard button), so a generous fixed TTL
// is fine — the reaper (scheduler/index.ts) tears it down even if the user
// never comes back to click "parar".
const SANDBOX_TTL_MS = 2 * 60 * 60 * 1000;
const HEALTH_CHECK_ATTEMPTS = 10;
const HEALTH_CHECK_INTERVAL_MS = 1000;

function toSandboxDTO(row: SandboxRow): SandboxEnvironmentDTO {
  return {
    id: row.id,
    status: row.status,
    branch: row.branch,
    internalBaseUrl: row.internal_base_url,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

sandboxRouter.get("/", (c) => {
  const ctx = c.get("project");
  const row = ctx.db.query("SELECT * FROM sandbox_environments ORDER BY id DESC LIMIT 1").get() as SandboxRow | null;
  return c.json({ sandbox: row ? toSandboxDTO(row) : null });
});

sandboxRouter.post("/", async (c) => {
  const ctx = c.get("project");
  const link = findRepoLinkForProject(ctx.id);
  if (!link) return c.json({ error: "no_repo_linked" }, 400);

  const { lastInsertRowid } = ctx.db.run(
    "INSERT INTO sandbox_environments (status, branch, expires_at) VALUES ('provisioning', ?1, ?2)",
    [link.branch, new Date(Date.now() + SANDBOX_TTL_MS).toISOString()],
  );
  const sandboxRowId = Number(lastInsertRowid);

  try {
    const patBlob = link.provider === "github" ? findRepoPatBlob(link.repo_id) : null;
    const result = await runnerClient.provisionSandbox({
      provider: link.provider,
      localPath: link.local_path ?? undefined,
      remoteUrl: link.remote_url ?? undefined,
      pat: patBlob ? decryptSecret(patBlob) : undefined,
      branch: link.branch,
      buildMethod: link.build_method,
      port: link.port,
    });

    // Per the Fase 1 design: poll health before ever reporting "running" —
    // a container that's up but still installing deps / crash-looping isn't
    // something the agent should be pointed at yet.
    let healthy = false;
    for (let attempt = 0; attempt < HEALTH_CHECK_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS));
      healthy = await runnerClient.checkSandboxHealth(result.sandboxId);
      if (healthy) break;
    }

    if (!healthy) {
      await runnerClient.teardownSandbox(result.sandboxId);
      ctx.db.run("UPDATE sandbox_environments SET status = 'error', error_message = 'health check timed out' WHERE id = ?1", [
        sandboxRowId,
      ]);
      return c.json({ error: "sandbox_unhealthy" }, 502);
    }

    ctx.db.run(
      "UPDATE sandbox_environments SET status = 'running', container_name = ?1, internal_base_url = ?2 WHERE id = ?3",
      [result.sandboxId, result.internalBaseUrl, sandboxRowId],
    );
  } catch (err) {
    ctx.db.run("UPDATE sandbox_environments SET status = 'error', error_message = ?1 WHERE id = ?2", [
      (err as Error).message,
      sandboxRowId,
    ]);
    return c.json({ error: "sandbox_provision_failed", message: (err as Error).message }, 502);
  }

  const row = ctx.db.query("SELECT * FROM sandbox_environments WHERE id = ?1").get(sandboxRowId) as SandboxRow;
  return c.json({ sandbox: toSandboxDTO(row) }, 201);
});

sandboxRouter.delete("/:id", async (c) => {
  const ctx = c.get("project");
  const id = Number(c.req.param("id"));
  const row = ctx.db.query("SELECT * FROM sandbox_environments WHERE id = ?1").get(id) as SandboxRow | null;
  if (!row) return c.json({ error: "sandbox_not_found" }, 404);

  if (row.container_name) await runnerClient.teardownSandbox(row.container_name);
  ctx.db.run("UPDATE sandbox_environments SET status = 'stopped', stopped_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1", [
    id,
  ]);
  return c.json({ deleted: true });
});
