import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { runRowToDTO } from "./dto-mappers.ts";
import type { TestRunRow } from "../mcp/rows.ts";
import { triggerRun } from "../runs/trigger-run.ts";
import { subscribeToRunEvents } from "../streaming/hub.ts";

export const runsRouter = new Hono();

runsRouter.get("/", (c) => {
  const ctx = c.get("project");
  const rows = ctx.db.query("SELECT * FROM test_runs ORDER BY started_at DESC LIMIT 100").all() as TestRunRow[];
  return c.json({ runs: rows.map(runRowToDTO) });
});

runsRouter.post("/", async (c) => {
  const ctx = c.get("project");
  const result = await triggerRun(ctx, { trigger: "manual" }); // no testIds => suite-wide
  return c.json(result, 202);
});

runsRouter.get("/:id/stream", (c) => {
  const runId = Number(c.req.param("id"));
  return streamSSE(c, async (stream) => {
    let aborted = false;
    // No `event:` name on these frames — the payload's own `kind` field
    // distinguishes them, and EventSource.onmessage only fires for unnamed
    // (default "message") frames. A named `event:` would silently vanish
    // client-side since nothing calls addEventListener for it.
    const { replay, isDone, unsubscribe } = subscribeToRunEvents(runId, (event) => {
      void stream.writeSSE({ data: JSON.stringify(event) });
    });
    // Replay first: a fast run can finish before this SSE connection opens,
    // so the terminal event may already be in the buffer, not still incoming.
    for (const event of replay) await stream.writeSSE({ data: JSON.stringify(event) });

    stream.onAbort(() => {
      aborted = true;
      unsubscribe();
    });
    try {
      while (!isDone() && !aborted) {
        await stream.sleep(15000);
        if (!isDone() && !aborted) await stream.writeSSE({ data: JSON.stringify({ kind: "heartbeat", runId, ts: Date.now() }) });
      }
    } finally {
      unsubscribe();
    }
  });
});
