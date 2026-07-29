import { Hono } from "hono";
import { z } from "zod";
import type { ProjectDTO } from "@tuxedo-qa/shared";
import { projectDbPath } from "../config.ts";
import { createProject, getProjectStats, listProjects } from "../db/registry.ts";
import { getActiveRunCount } from "../streaming/hub.ts";

export const projectsRouter = new Hono();

const createProjectSchema = z.object({
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "lowercase letters, digits, hyphens"),
  name: z.string().min(1),
});

projectsRouter.get("/", (c) => {
  const projects: ProjectDTO[] = listProjects().map((row) => {
    const stats = getProjectStats(row.id);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      testCount: stats?.test_count ?? 0,
      passingCount: stats?.passing_count ?? 0,
      failingCount: stats?.failing_count ?? 0,
      lastRunAt: stats?.last_run_at ?? null,
      activeRunCount: getActiveRunCount(row.slug),
    };
  });
  return c.json({ projects });
});

projectsRouter.post("/", async (c) => {
  const parsed = createProjectSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);

  try {
    const row = createProject(parsed.data.slug, parsed.data.name, projectDbPath(parsed.data.slug));
    return c.json({ project: row }, 201);
  } catch (err) {
    if ((err as Error).message.includes("UNIQUE constraint")) {
      return c.json({ error: "slug_taken", slug: parsed.data.slug }, 409);
    }
    throw err;
  }
});
