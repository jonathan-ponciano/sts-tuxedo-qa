import type {
  Action,
  DryRunRequest,
  DryRunResponse,
  InspectPageRequest,
  InspectPageResponse,
  PairDebugEvent,
  PairDebugInputEvent,
  PairDebugStartRequest,
  PairDebugStartResponse,
  PairDebugStepResponse,
  PairDebugStopResponse,
  RunRequest,
  RunnerHealthResponse,
  SandboxProvisionRequest,
  SandboxProvisionResponse,
} from "@tuxedo-qa/shared";
import { config } from "../config.ts";

async function post<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const res = await fetch(`${config.runnerBaseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`runner ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TRes;
}

export const runnerClient = {
  inspectPage: (req: InspectPageRequest) => post<InspectPageRequest, InspectPageResponse>("/internal/inspect-page", req),
  dryRunTest: (req: DryRunRequest) => post<DryRunRequest, DryRunResponse>("/internal/tests/dry-run", req),
  startRun: (req: RunRequest) => post<RunRequest, { accepted: true }>("/internal/runs", req),
  startPairDebug: (req: PairDebugStartRequest) => post<PairDebugStartRequest, PairDebugStartResponse>("/internal/pair-debug/sessions", req),
  stopPairDebug: async (sessionId: string): Promise<PairDebugStopResponse> => {
    const res = await fetch(`${config.runnerBaseUrl}/internal/pair-debug/sessions/${sessionId}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`runner pair-debug stop failed: ${res.status}`);
    return (await res.json()) as PairDebugStopResponse;
  },
  getPairDebugSnapshot: async (sessionId: string): Promise<{ events: PairDebugEvent[] }> => {
    const res = await fetch(`${config.runnerBaseUrl}/internal/pair-debug/sessions/${sessionId}/snapshot`);
    if (!res.ok) throw new Error(`runner pair-debug snapshot failed: ${res.status}`);
    return (await res.json()) as { events: PairDebugEvent[] };
  },
  stepPairDebug: async (sessionId: string, action: Action): Promise<PairDebugStepResponse> => {
    const res = await fetch(`${config.runnerBaseUrl}/internal/pair-debug/sessions/${sessionId}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`runner pair-debug step failed: ${res.status} ${text}`);
    }
    return (await res.json()) as PairDebugStepResponse;
  },
  health: async (): Promise<RunnerHealthResponse> => {
    const res = await fetch(`${config.runnerBaseUrl}/internal/health`);
    if (!res.ok) throw new Error(`runner health check failed: ${res.status}`);
    return (await res.json()) as RunnerHealthResponse;
  },
  runEventsUrl: (runId: number) => `${config.runnerBaseUrl}/internal/runs/${runId}/events`,
  pairDebugScreencastUrl: (sessionId: string) => `${config.runnerBaseUrl}/internal/pair-debug/sessions/${sessionId}/screencast`,
  dispatchPairDebugInput: async (sessionId: string, event: PairDebugInputEvent): Promise<void> => {
    const res = await fetch(`${config.runnerBaseUrl}/internal/pair-debug/sessions/${sessionId}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`runner pair-debug input failed: ${res.status} ${text}`);
    }
  },
  provisionSandbox: (req: SandboxProvisionRequest) => post<SandboxProvisionRequest, SandboxProvisionResponse>("/internal/sandbox", req),
  checkSandboxHealth: async (sandboxId: string): Promise<boolean> => {
    const res = await fetch(`${config.runnerBaseUrl}/internal/sandbox/${sandboxId}/health`);
    if (!res.ok) return false;
    const body = (await res.json()) as { healthy: boolean };
    return body.healthy;
  },
  teardownSandbox: async (sandboxId: string): Promise<void> => {
    await fetch(`${config.runnerBaseUrl}/internal/sandbox/${sandboxId}`, { method: "DELETE" });
  },
};
