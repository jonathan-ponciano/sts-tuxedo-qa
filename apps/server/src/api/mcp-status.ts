import { Hono } from "hono";
import { findProjectById } from "../db/registry.ts";

export const mcpStatusRouter = new Hono();

mcpStatusRouter.get("/", (c) => {
  const ctx = c.get("project");
  const row = findProjectById(ctx.id);
  return c.json({ lastConnectedAt: row?.mcp_last_connected_at ?? null });
});
