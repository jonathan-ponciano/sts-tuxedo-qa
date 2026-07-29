import type {
  DryRunRequest,
  DryRunResponse,
  InspectPageRequest,
  InspectPageResponse,
  PairDebugStartRequest,
  PairDebugStartResponse,
  PairDebugStopResponse,
  RunRequest,
  RunnerHealthResponse,
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
  health: async (): Promise<RunnerHealthResponse> => {
    const res = await fetch(`${config.runnerBaseUrl}/internal/health`);
    if (!res.ok) throw new Error(`runner health check failed: ${res.status}`);
    return (await res.json()) as RunnerHealthResponse;
  },
  runEventsUrl: (runId: number) => `${config.runnerBaseUrl}/internal/runs/${runId}/events`,
};
