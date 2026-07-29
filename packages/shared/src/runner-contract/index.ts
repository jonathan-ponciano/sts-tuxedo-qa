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
  vncWsPath: string;
}
export interface PairDebugStopResponse {
  draftTestSource: string;
  events: PairDebugEvent[];
}

export interface RunnerHealthResponse {
  ok: true;
  browsersReady: boolean;
}
