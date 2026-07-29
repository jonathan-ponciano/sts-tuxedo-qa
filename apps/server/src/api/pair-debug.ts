import { Hono } from "hono";
import { z } from "zod";
import { getPairDebugContext, startPairDebug, stopPairDebug } from "../mcp/handlers.ts";

export const pairDebugRouter = new Hono();

const startSchema = z.object({ url: z.string().url().optional() });

pairDebugRouter.post("/sessions", async (c) => {
  const ctx = c.get("project");
  const parsed = startSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  try {
    const result = await startPairDebug(ctx, parsed.data);
    return c.json(result, 201);
  } catch (err) {
    return c.json({ error: "pair_debug_start_failed", message: (err as Error).message }, 409);
  }
});

pairDebugRouter.get("/sessions/:id", async (c) => {
  const ctx = c.get("project");
  const sessionId = Number(c.req.param("id"));
  try {
    const result = await getPairDebugContext(ctx, { sessionId });
    return c.json(result);
  } catch (err) {
    return c.json({ error: "pair_debug_session_not_found", message: (err as Error).message }, 404);
  }
});

pairDebugRouter.delete("/sessions/:id", async (c) => {
  const ctx = c.get("project");
  const sessionId = Number(c.req.param("id"));
  try {
    const result = await stopPairDebug(ctx, { sessionId });
    return c.json(result);
  } catch (err) {
    return c.json({ error: "pair_debug_stop_failed", message: (err as Error).message }, 404);
  }
});
