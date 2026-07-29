import { Hono } from "hono";
import { z } from "zod";
import type { PublicStatusPageDTO, StatusPageConfigDTO } from "@tuxedo-qa/shared";
import { resolveProjectById } from "../db/project-context.ts";
import { clearStatusPageSlug, findProjectIdByStatusPageSlug, setStatusPageSlug } from "../db/registry.ts";

export const statusPageRouter = new Hono();
export const publicStatusRouter = new Hono();

interface ConfigRow {
  enabled: number;
  slug: string | null;
  title: string | null;
  description: string | null;
}

statusPageRouter.get("/", (c) => {
  const ctx = c.get("project");
  const row = ctx.db.query("SELECT enabled, slug, title, description FROM status_page_config WHERE id = 1").get() as
    | ConfigRow
    | null;
  const testIds = ctx.db.query("SELECT test_id FROM status_page_tests WHERE config_id = 1 ORDER BY display_order").all() as Array<{
    test_id: number;
  }>;
  const dto: StatusPageConfigDTO = {
    enabled: Boolean(row?.enabled),
    slug: row?.slug ?? null,
    title: row?.title ?? null,
    description: row?.description ?? null,
    testIds: testIds.map((r) => r.test_id),
  };
  return c.json({ statusPageConfig: dto });
});

const putSchema = z.object({
  enabled: z.boolean(),
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/).nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  testIds: z.array(z.number()),
});

statusPageRouter.put("/", async (c) => {
  const ctx = c.get("project");
  const parsed = putSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const body = parsed.data;

  if (body.enabled && !body.slug) return c.json({ error: "slug_required_when_enabled" }, 400);

  ctx.db.transaction(() => {
    ctx.db.run(
      `INSERT INTO status_page_config (id, enabled, slug, title, description) VALUES (1, ?1, ?2, ?3, ?4)
       ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, slug = excluded.slug, title = excluded.title, description = excluded.description`,
      [body.enabled ? 1 : 0, body.slug, body.title, body.description],
    );
    ctx.db.run("DELETE FROM status_page_tests WHERE config_id = 1");
    body.testIds.forEach((testId, index) => {
      ctx.db.run("INSERT INTO status_page_tests (config_id, test_id, display_order) VALUES (1, ?1, ?2)", [testId, index]);
    });
  })();

  if (body.enabled && body.slug) {
    try {
      setStatusPageSlug(ctx.id, body.slug);
    } catch (err) {
      if ((err as Error).message.includes("UNIQUE constraint")) {
        return c.json({ error: "status_page_slug_taken", slug: body.slug }, 409);
      }
      throw err;
    }
  } else {
    clearStatusPageSlug(ctx.id);
  }

  return c.json({ ok: true });
});

/**
 * Own serializer, not a filtered view of the authenticated config route —
 * a field added to StatusPageConfigDTO later can't leak here by accident.
 */
publicStatusRouter.get("/:pageSlug", (c) => {
  const pageSlug = c.req.param("pageSlug");
  const projectId = findProjectIdByStatusPageSlug(pageSlug);
  if (!projectId) return c.json({ error: "status_page_not_found" }, 404);

  const ctx = resolveProjectById(projectId);
  const config = ctx.db.query("SELECT enabled, title, description FROM status_page_config WHERE id = 1").get() as
    | ConfigRow
    | null;
  if (!config?.enabled) return c.json({ error: "status_page_not_found" }, 404);

  const tests = ctx.db
    .query(
      `SELECT t.name, t.last_run_status, r.started_at as last_run_at
       FROM status_page_tests spt
       JOIN tests t ON t.id = spt.test_id
       LEFT JOIN test_runs r ON r.id = t.last_run_id
       WHERE spt.config_id = 1
       ORDER BY spt.display_order`,
    )
    .all() as Array<{ name: string; last_run_status: string | null; last_run_at: string | null }>;

  const dto: PublicStatusPageDTO = {
    title: config.title ?? "Status",
    description: config.description,
    tests: tests.map((t) => ({ name: t.name, status: (t.last_run_status as never) ?? null, lastRunAt: t.last_run_at })),
  };
  return c.json(dto);
});
