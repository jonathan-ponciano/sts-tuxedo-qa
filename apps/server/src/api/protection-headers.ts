import { Hono } from "hono";
import { z } from "zod";
import type { ProtectionHeaderDTO } from "@tuxedo-qa/shared";
import { encryptSecret } from "../crypto/index.ts";

export const protectionHeadersRouter = new Hono();

interface HeaderRow {
  id: number;
  header_name: string;
  enabled: number;
}

function toDTO(row: HeaderRow): ProtectionHeaderDTO {
  return { id: row.id, headerName: row.header_name, enabled: Boolean(row.enabled) };
}

protectionHeadersRouter.get("/", (c) => {
  const ctx = c.get("project");
  const rows = ctx.db.query("SELECT id, header_name, enabled FROM protection_headers ORDER BY header_name").all() as HeaderRow[];
  return c.json({ headers: rows.map(toDTO) });
});

const createSchema = z.object({ headerName: z.string().min(1), value: z.string().min(1) });

protectionHeadersRouter.post("/", async (c) => {
  const ctx = c.get("project");
  const parsed = createSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const blob = encryptSecret(parsed.data.value);
  const { lastInsertRowid } = ctx.db.run(
    "INSERT INTO protection_headers (header_name, secret_blob, enabled) VALUES (?1, ?2, 1)",
    [parsed.data.headerName, blob],
  );
  return c.json({ headerId: lastInsertRowid }, 201);
});

const patchSchema = z.object({ enabled: z.boolean() });

protectionHeadersRouter.patch("/:id", async (c) => {
  const ctx = c.get("project");
  const id = Number(c.req.param("id"));
  const parsed = patchSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const { changes } = ctx.db.run("UPDATE protection_headers SET enabled = ?1 WHERE id = ?2", [parsed.data.enabled ? 1 : 0, id]);
  if (changes === 0) return c.json({ error: "header_not_found" }, 404);
  return c.json({ ok: true });
});

protectionHeadersRouter.delete("/:id", (c) => {
  const ctx = c.get("project");
  const id = Number(c.req.param("id"));
  const { changes } = ctx.db.run("DELETE FROM protection_headers WHERE id = ?1", [id]);
  if (changes === 0) return c.json({ error: "header_not_found" }, 404);
  return c.json({ deleted: true });
});
