import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { testRowToDetailDTO, testRowToDTO } from "./dto-mappers.ts";
import type { TestRow } from "../mcp/rows.ts";
import { computeNextDueAt } from "../runs/schedule.ts";
import { triggerRun } from "../runs/trigger-run.ts";

export const testsRouter = new Hono();

const TEST_JOIN = "SELECT t.*, r.started_at as last_run_at FROM tests t LEFT JOIN test_runs r ON r.id = t.last_run_id";

testsRouter.get("/", (c) => {
  const ctx = c.get("project");
  const rows = ctx.db.query(`${TEST_JOIN} ORDER BY t.name`).all() as TestRow[];
  return c.json({ tests: rows.map(testRowToDTO) });
});

testsRouter.get("/:id", (c) => {
  const ctx = c.get("project");
  const id = Number(c.req.param("id"));
  const row = ctx.db.query(`${TEST_JOIN} WHERE t.id = ?1`).get(id) as TestRow | null;
  if (!row) return c.json({ error: "test_not_found" }, 404);
  const path = join(ctx.specsDir, row.file_path);
  return c.json({ test: testRowToDetailDTO(row, existsSync(path) ? readFileSync(path, "utf8") : "") });
});

const patchSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  script: z.string().optional(),
  schedule: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

testsRouter.patch("/:id", async (c) => {
  const ctx = c.get("project");
  const id = Number(c.req.param("id"));
  const parsed = patchSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const patch = parsed.data;

  const existing = ctx.db.query(`${TEST_JOIN} WHERE t.id = ?1`).get(id) as TestRow | null;
  if (!existing) return c.json({ error: "test_not_found" }, 404);

  if (patch.script !== undefined) {
    writeFileSync(join(ctx.specsDir, existing.file_path), patch.script, "utf8");
  }

  const nextDueAt = computeNextDueAt(patch.schedule, existing.schedule, existing.next_due_at);
  ctx.db.run(
    `UPDATE tests SET name = ?1, description = ?2, schedule = ?3, next_due_at = ?4, tags = ?5,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?6`,
    [
      patch.name ?? existing.name,
      patch.description ?? existing.description,
      patch.schedule === undefined ? existing.schedule : patch.schedule,
      nextDueAt,
      patch.tags ? JSON.stringify(patch.tags) : existing.tags,
      id,
    ],
  );

  const updated = ctx.db.query(`${TEST_JOIN} WHERE t.id = ?1`).get(id) as TestRow;
  const path = join(ctx.specsDir, updated.file_path);
  return c.json({ test: testRowToDetailDTO(updated, existsSync(path) ? readFileSync(path, "utf8") : "") });
});

// Deliberately separate from the main PATCH /:id (which mirrors the MCP-facing
// update_test tool almost 1:1) — enabling/disabling a schedule or moving it to
// a different branch is a human dashboard decision, not something the agent
// should be able to flip mid-conversation.
const scheduleSchema = z.object({
  enabled: z.boolean().optional(),
  branch: z.string().nullable().optional(),
});

testsRouter.patch("/:id/schedule", async (c) => {
  const ctx = c.get("project");
  const id = Number(c.req.param("id"));
  const parsed = scheduleSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const { enabled, branch } = parsed.data;

  const existing = ctx.db.query(`${TEST_JOIN} WHERE t.id = ?1`).get(id) as TestRow | null;
  if (!existing) return c.json({ error: "test_not_found" }, 404);

  ctx.db.run(
    `UPDATE tests SET schedule_enabled = ?1, branch = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?3`,
    [enabled === undefined ? existing.schedule_enabled : Number(enabled), branch === undefined ? existing.branch : branch, id],
  );

  const updated = ctx.db.query(`${TEST_JOIN} WHERE t.id = ?1`).get(id) as TestRow;
  const path = join(ctx.specsDir, updated.file_path);
  return c.json({ test: testRowToDetailDTO(updated, existsSync(path) ? readFileSync(path, "utf8") : "") });
});

testsRouter.post("/:id/run", async (c) => {
  const ctx = c.get("project");
  const id = Number(c.req.param("id"));
  const existing = ctx.db.query("SELECT id FROM tests WHERE id = ?1").get(id);
  if (!existing) return c.json({ error: "test_not_found" }, 404);
  const result = await triggerRun(ctx, { testIds: [id], trigger: "manual" });
  return c.json(result, 202);
});

testsRouter.delete("/:id", (c) => {
  const ctx = c.get("project");
  const id = Number(c.req.param("id"));
  const existing = ctx.db.query("SELECT file_path FROM tests WHERE id = ?1").get(id) as { file_path: string } | null;
  if (!existing) return c.json({ error: "test_not_found" }, 404);
  const specPath = join(ctx.specsDir, existing.file_path);
  if (existsSync(specPath)) unlinkSync(specPath);
  ctx.db.run("DELETE FROM tests WHERE id = ?1", [id]);
  return c.json({ deleted: true });
});
