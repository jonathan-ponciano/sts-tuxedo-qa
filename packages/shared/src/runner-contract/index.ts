import type { Action, ElementInfo, NetworkEntry, PairDebugEvent } from "../mcp-schemas/common.ts";

/** Contract for the internal HTTP API the `app` container calls on `runner`. Never exposed publicly. */

export interface InspectPageRequest {
  projectSlug: string;
  url: string;
  actions?: Action[];
  headers?: Record<string, string>;
}
export interface InspectPageResponse {
  elements: ElementInfo[];
  network: NetworkEntry[];
  screenshotBase64: string | null;
}

export interface DryRunRequest {
  projectSlug: string;
  specSource: string;
  protectionHeaders?: Record<string, string>;
}
export interface DryRunResponse {
  valid: boolean;
  errors?: string[];
  executedOk: boolean;
}

/**
 * The runner has no DB access, so it can't resolve numeric testIds itself —
 * `app` resolves them to spec file names (relative to the project's
 * specsDir) before calling this. Omitting `targets` entirely means "run
 * every *.spec.ts file in the project" (suite-wide run).
 */
export interface RunTarget {
  testId: number;
  fileName: string;
}

export interface RunRequest {
  projectSlug: string;
  runId: number;
  targets?: RunTarget[];
  headed?: boolean;
  protectionHeaders?: Record<string, string>;
  env?: Record<string, string>;
}
export interface RunAcceptedResponse {
  accepted: true;
}

export interface PairDebugStartRequest {
  projectSlug: string;
  url?: string;
  protectionHeaders?: Record<string, string>;
}
export interface PairDebugStartResponse {
  sessionId: string;
}
export interface PairDebugStopResponse {
  draftTestSource: string;
  events: PairDebugEvent[];
}
export interface PairDebugStepRequest {
  action: Action;
}
export interface PairDebugStepResponse {
  screenshotBase64: string;
  events: PairDebugEvent[];
}

/**
 * Raw browser input forwarded from a human watching the live preview —
 * mirrors native mouse/keyboard event shapes closely enough that the SPA can
 * build these straight from onMouseMove/onKeyDown handlers. Never AI-facing
 * (the AI drives via `Action`/`step_pair_debug`, not this), so it lives here
 * rather than in mcp-schemas.
 */
export type PairDebugInputEvent =
  | { type: "mouseMove"; x: number; y: number }
  | { type: "mouseDown"; x: number; y: number; button?: "left" | "right" | "middle" }
  | { type: "mouseUp"; x: number; y: number; button?: "left" | "right" | "middle" }
  | { type: "wheel"; x: number; y: number; deltaX: number; deltaY: number }
  | { type: "keyDown"; key: string; code: string; text?: string }
  | { type: "keyUp"; key: string; code: string };

export interface RunnerHealthResponse {
  ok: true;
  browsersReady: boolean;
}

export interface SandboxProvisionRequest {
  provider: "local" | "github";
  localPath?: string;
  remoteUrl?: string;
  pat?: string;
  branch: string;
  buildMethod: "dockerfile" | "node";
  port: number;
}
export interface SandboxProvisionResponse {
  sandboxId: string;
  internalBaseUrl: string;
}
