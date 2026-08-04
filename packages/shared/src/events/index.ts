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

export type AgentRunStatus = "running" | "waiting_input" | "completed" | "error";

/** Unifies model text, tool progress, and run status into one SSE stream per chat thread. */
export type ChatStreamEvent =
  | { kind: "text_delta"; text: string; ts: number }
  | { kind: "tool_call"; name: string; input: unknown; ts: number }
  | { kind: "tool_result"; name: string; ok: boolean; output: unknown; ts: number }
  | { kind: "run_status"; status: AgentRunStatus; errorMessage?: string; waitingOnCredentialId?: number; ts: number };
