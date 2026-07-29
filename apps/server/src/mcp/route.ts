import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { ProjectNotFoundError, resolveProject } from "../db/project-context.ts";
import { touchMcpConnected } from "../db/registry.ts";
import { createMcpServerForProject } from "./register.ts";

export const mcpRoute = new Hono();

/**
 * One path-scoped endpoint per project: /mcp/:slug. `resolveProject` runs
 * before anything else touches the request, so an unknown/disabled slug
 * never reaches tool registration at all.
 */
mcpRoute.all("/:slug", async (c) => {
  const slug = c.req.param("slug");

  let ctx: ReturnType<typeof resolveProject>;
  try {
    ctx = resolveProject(slug);
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return c.json({ error: "project_not_found", slug }, 404);
    }
    throw err;
  }

  touchMcpConnected(ctx.id);

  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createMcpServerForProject(ctx);
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});
