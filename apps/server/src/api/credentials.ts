import { Hono } from "hono";
import { z } from "zod";
import { credentialRowToMaskedDTO } from "./dto-mappers.ts";
import { resumeAgentRunsWaitingOnCredential } from "../agent/credential-events.ts";
import { encryptSecret } from "../crypto/index.ts";
import type { CredentialRow } from "../mcp/rows.ts";

export const credentialsRouter = new Hono();

const SELECT_MASKED = "SELECT id, name, description, status, requested_at, fulfilled_at FROM credentials";

credentialsRouter.get("/", (c) => {
  const ctx = c.get("project");
  const rows = ctx.db.query(`${SELECT_MASKED} ORDER BY name`).all() as CredentialRow[];
  return c.json({ credentials: rows.map(credentialRowToMaskedDTO) });
});

const fulfillSchema = z.object({ value: z.string().min(1) });

/**
 * The only route in the whole system where a plaintext secret value
 * travels. Human-only (dashboard), never reachable from the /mcp router.
 */
credentialsRouter.patch("/:id/fulfill", async (c) => {
  const ctx = c.get("project");
  const id = Number(c.req.param("id"));
  const parsed = fulfillSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);

  const blob = encryptSecret(parsed.data.value);
  const { changes } = ctx.db.run(
    `UPDATE credentials SET secret_blob = ?1, status = 'fulfilled',
       fulfilled_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?2`,
    [blob, id],
  );
  if (changes === 0) return c.json({ error: "credential_not_found" }, 404);

  resumeAgentRunsWaitingOnCredential(ctx, id);

  const row = ctx.db.query(`${SELECT_MASKED} WHERE id = ?1`).get(id) as CredentialRow;
  return c.json({ credential: credentialRowToMaskedDTO(row) });
});

credentialsRouter.delete("/:id", (c) => {
  const ctx = c.get("project");
  const id = Number(c.req.param("id"));
  const { changes } = ctx.db.run("DELETE FROM credentials WHERE id = ?1", [id]);
  if (changes === 0) return c.json({ error: "credential_not_found" }, 404);
  return c.json({ deleted: true });
});
