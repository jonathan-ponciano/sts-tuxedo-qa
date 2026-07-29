import type { MiddlewareHandler } from "hono";
import type { ProjectContext } from "../db/project-context.ts";
import { ProjectNotFoundError, resolveProject } from "../db/project-context.ts";

declare module "hono" {
  interface ContextVariableMap {
    project: ProjectContext;
  }
}

/** REST equivalent of the MCP route's resolver — the only other place allowed to call resolveProject. */
export const projectMiddleware: MiddlewareHandler = async (c, next) => {
  const slug = c.req.param("slug");
  if (!slug) return c.json({ error: "missing_project_slug" }, 400);
  try {
    c.set("project", resolveProject(slug));
  } catch (err) {
    if (err instanceof ProjectNotFoundError) return c.json({ error: "project_not_found", slug }, 404);
    throw err;
  }
  await next();
};
