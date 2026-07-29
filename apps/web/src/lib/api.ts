import type {
  CredentialMaskedDTO,
  ProjectDTO,
  ProtectionHeaderDTO,
  RunDTO,
  StatusPageConfigDTO,
  TestDetailDTO,
  TestDTO,
  WebhookDTO,
} from "@tuxedo-qa/shared";

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
  listWebhooks: (slug: string) => request<{ webhooks: WebhookDTO[] }>(`/projects/${slug}/webhooks`),
  getStatusPageConfig: (slug: string) => request<{ statusPageConfig: StatusPageConfigDTO }>(`/projects/${slug}/status-page-config`),
};
