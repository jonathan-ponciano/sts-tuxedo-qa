import { Hono } from "hono";
import { z } from "zod";
import type { WebhookDTO } from "@tuxedo-qa/shared";

export const webhooksRouter = new Hono();

interface WebhookRow {
  id: number;
  kind: "discord" | "slack" | "generic";
  url: string;
  enabled: number;
  events: string;
}

function toDTO(row: WebhookRow): WebhookDTO {
  return { id: row.id, kind: row.kind, url: row.url, enabled: Boolean(row.enabled), events: JSON.parse(row.events) };
}

webhooksRouter.get("/", (c) => {
  const ctx = c.get("project");
  const rows = ctx.db.query("SELECT * FROM webhooks ORDER BY id").all() as WebhookRow[];
  return c.json({ webhooks: rows.map(toDTO) });
});

const createSchema = z.object({
  kind: z.enum(["discord", "slack", "generic"]),
  url: z.string().url(),
  events: z.array(z.enum(["pass", "fail", "error"])).default(["fail", "error"]),
});

webhooksRouter.post("/", async (c) => {
  const ctx = c.get("project");
  const parsed = createSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const { lastInsertRowid } = ctx.db.run(
    "INSERT INTO webhooks (kind, url, events) VALUES (?1, ?2, ?3)",
    [parsed.data.kind, parsed.data.url, JSON.stringify(parsed.data.events)],
  );
  return c.json({ webhookId: lastInsertRowid }, 201);
});

const patchSchema = z.object({ enabled: z.boolean() });

webhooksRouter.patch("/:id", async (c) => {
  const ctx = c.get("project");
  const id = Number(c.req.param("id"));
  const parsed = patchSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const { changes } = ctx.db.run("UPDATE webhooks SET enabled = ?1 WHERE id = ?2", [parsed.data.enabled ? 1 : 0, id]);
  if (changes === 0) return c.json({ error: "webhook_not_found" }, 404);
  return c.json({ ok: true });
});

webhooksRouter.delete("/:id", (c) => {
  const ctx = c.get("project");
  const id = Number(c.req.param("id"));
  const { changes } = ctx.db.run("DELETE FROM webhooks WHERE id = ?1", [id]);
  if (changes === 0) return c.json({ error: "webhook_not_found" }, 404);
  return c.json({ deleted: true });
});
