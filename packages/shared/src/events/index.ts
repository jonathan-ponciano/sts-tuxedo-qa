import type { RunStatus } from "../mcp-schemas/common.ts";

/** SSE payloads. Server -> client only, both hops (runner -> app, app -> SPA). */

export type RunProgressEvent =
  | { kind: "step"; runId: number; testName: string; step: string; ts: number }
  | { kind: "log"; runId: number; line: string; ts: number }
  | { kind: "screenshot"; runId: number; base64: string; ts: number }
  | { kind: "status"; runId: number; status: RunStatus; ts: number }
  | { kind: "heartbeat"; runId: number; ts: number };

export type PairDebugTimelineEvent = {
  kind: "timeline";
  sessionId: string;
  seq: number;
  ts: number;
  type: "console" | "network" | "nav" | "click";
  payload: Record<string, unknown>;
};
