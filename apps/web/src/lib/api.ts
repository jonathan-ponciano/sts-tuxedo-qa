import type {
  ChatMessageDTO,
  ChatThreadDTO,
  CredentialMaskedDTO,
  PairDebugEvent,
  PairDebugInputEvent,
  ProjectDTO,
  ProtectionHeaderDTO,
  PublicStatusPageDTO,
  RunDTO,
  StatusPageConfigDTO,
  TestDetailDTO,
  TestDTO,
  WebhookDTO,
} from "@tuxedo-qa/shared";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}
export interface AuthAccount {
  id: number;
  name: string;
  slug: string;
}

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? `request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => request<{ projects: ProjectDTO[] }>("/projects"),
  createProject: (body: { slug: string; name: string }) =>
    request<{ project: unknown }>("/projects", { method: "POST", body: JSON.stringify(body) }),

  listTests: (slug: string) => request<{ tests: TestDTO[] }>(`/projects/${slug}/tests`),
  getTest: (slug: string, id: number) => request<{ test: TestDetailDTO }>(`/projects/${slug}/tests/${id}`),
  updateTest: (slug: string, id: number, patch: Record<string, unknown>) =>
    request<{ test: TestDetailDTO }>(`/projects/${slug}/tests/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  runTest: (slug: string, id: number) =>
    request<{ runId: number; status: string }>(`/projects/${slug}/tests/${id}/run`, { method: "POST" }),

  listRuns: (slug: string) => request<{ runs: RunDTO[] }>(`/projects/${slug}/runs`),
  runSuite: (slug: string) => request<{ runId: number; status: string }>(`/projects/${slug}/runs`, { method: "POST" }),

  listCredentials: (slug: string) => request<{ credentials: CredentialMaskedDTO[] }>(`/projects/${slug}/credentials`),
  fulfillCredential: (slug: string, id: number, value: string) =>
    request<{ credential: CredentialMaskedDTO }>(`/projects/${slug}/credentials/${id}/fulfill`, {
      method: "PATCH",
      body: JSON.stringify({ value }),
    }),
  deleteCredential: (slug: string, id: number) =>
    request<{ deleted: true }>(`/projects/${slug}/credentials/${id}`, { method: "DELETE" }),

  listProtectionHeaders: (slug: string) => request<{ headers: ProtectionHeaderDTO[] }>(`/projects/${slug}/protection-headers`),
  createProtectionHeader: (slug: string, headerName: string, value: string) =>
    request<{ headerId: number }>(`/projects/${slug}/protection-headers`, {
      method: "POST",
      body: JSON.stringify({ headerName, value }),
    }),
  setProtectionHeaderEnabled: (slug: string, id: number, enabled: boolean) =>
    request<{ ok: true }>(`/projects/${slug}/protection-headers/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
  deleteProtectionHeader: (slug: string, id: number) =>
    request<{ deleted: true }>(`/projects/${slug}/protection-headers/${id}`, { method: "DELETE" }),

  listWebhooks: (slug: string) => request<{ webhooks: WebhookDTO[] }>(`/projects/${slug}/webhooks`),
  createWebhook: (slug: string, body: { kind: string; url: string; events: string[] }) =>
    request<{ webhookId: number }>(`/projects/${slug}/webhooks`, { method: "POST", body: JSON.stringify(body) }),
  setWebhookEnabled: (slug: string, id: number, enabled: boolean) =>
    request<{ ok: true }>(`/projects/${slug}/webhooks/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
  deleteWebhook: (slug: string, id: number) =>
    request<{ deleted: true }>(`/projects/${slug}/webhooks/${id}`, { method: "DELETE" }),

  getStatusPageConfig: (slug: string) => request<{ statusPageConfig: StatusPageConfigDTO }>(`/projects/${slug}/status-page-config`),
  saveStatusPageConfig: (slug: string, body: StatusPageConfigDTO) =>
    request<{ ok: true }>(`/projects/${slug}/status-page-config`, { method: "PUT", body: JSON.stringify(body) }),
  getPublicStatus: (pageSlug: string) => request<PublicStatusPageDTO>(`/public/status/${pageSlug}`),

  getMcpStatus: (slug: string) => request<{ lastConnectedAt: string | null }>(`/projects/${slug}/mcp-status`),

  startPairDebug: (slug: string, url?: string) =>
    request<{ sessionId: number }>(`/projects/${slug}/pair-debug/sessions`, {
      method: "POST",
      body: JSON.stringify(url ? { url } : {}),
    }),
  getPairDebugContext: (slug: string, sessionId: number) =>
    request<{ events: PairDebugEvent[] }>(`/projects/${slug}/pair-debug/sessions/${sessionId}`),
  stopPairDebug: (slug: string, sessionId: number) =>
    request<{ draftTestSource: string; events: PairDebugEvent[] }>(`/projects/${slug}/pair-debug/sessions/${sessionId}`, {
      method: "DELETE",
    }),
  pairDebugScreencastUrl: (slug: string, sessionId: number) => `${BASE}/projects/${slug}/pair-debug/sessions/${sessionId}/screencast`,
  sendPairDebugInput: (slug: string, sessionId: number, event: PairDebugInputEvent) =>
    request<{ ok: true }>(`/projects/${slug}/pair-debug/sessions/${sessionId}/input`, {
      method: "POST",
      body: JSON.stringify(event),
    }),

  signup: (body: { email: string; name: string; password: string }) =>
    request<{ user: AuthUser; account: AuthAccount }>("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ user: AuthUser }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  listChatThreads: (slug: string) => request<{ threads: ChatThreadDTO[] }>(`/projects/${slug}/chat/threads`),
  createChatThread: (slug: string, title?: string) =>
    request<{ thread: ChatThreadDTO }>(`/projects/${slug}/chat/threads`, {
      method: "POST",
      body: JSON.stringify(title ? { title } : {}),
    }),
  getChatThread: (slug: string, threadId: number) =>
    request<{ thread: ChatThreadDTO; messages: ChatMessageDTO[]; busy: boolean; waitingOnCredentialId: number | null }>(
      `/projects/${slug}/chat/threads/${threadId}`,
    ),
  sendChatMessage: (slug: string, threadId: number, text: string) =>
    request<{ accepted: true }>(`/projects/${slug}/chat/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  chatStreamUrl: (slug: string, threadId: number) => `${BASE}/projects/${slug}/chat/threads/${threadId}/stream`,

  getLlmCredentials: () => request<{ providers: Array<"anthropic" | "gemini"> }>("/account/llm-credentials"),
  saveLlmCredential: (provider: "anthropic" | "gemini", apiKey: string) =>
    request<{ ok: true }>(`/account/llm-credentials/${provider}`, { method: "PUT", body: JSON.stringify({ apiKey }) }),
  deleteLlmCredential: (provider: "anthropic" | "gemini") =>
    request<{ ok: true }>(`/account/llm-credentials/${provider}`, { method: "DELETE" }),

  // Bypasses `request()`: a 401 here just means "not logged in", not an error to throw on.
  me: async (): Promise<{ user: AuthUser | null; accounts?: AuthAccount[] }> => {
    const res = await fetch(`${BASE}/auth/me`, { headers: { "content-type": "application/json" } });
    if (res.status === 401) return { user: null };
    if (!res.ok) throw new Error(`request failed: ${res.status}`);
    return res.json() as Promise<{ user: AuthUser; accounts: AuthAccount[] }>;
  },
};
