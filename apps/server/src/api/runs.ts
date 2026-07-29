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

const TERMINAL = new Set(["passed", "failed", "error", "timeout"]);

runsRouter.get("/:id/stream", (c) => {
  const runId = Number(c.req.param("id"));
  return streamSSE(c, async (stream) => {
    let done = false;
    const unsubscribe = subscribeToRunEvents(runId, (event) => {
      void stream.writeSSE({ data: JSON.stringify(event), event: event.kind });
      if (event.kind === "status" && TERMINAL.has(event.status)) done = true;
    });
    stream.onAbort(() => {
      done = true;
      unsubscribe();
    });
    try {
      while (!done) {
        await stream.sleep(15000);
        if (!done) await stream.writeSSE({ data: JSON.stringify({ kind: "heartbeat", runId, ts: Date.now() }) });
      }
    } finally {
      unsubscribe();
    }
  });
});
