import type { RunStatus, RunTrigger } from "../mcp-schemas/common.ts";

export interface ProjectDTO {
  id: number;
  slug: string;
  name: string;
  testCount: number;
  passingCount: number;
  failingCount: number;
  lastRunAt: string | null;
  activeRunCount: number; // from the in-memory active-run registry, not the DB
}

export interface TestDTO {
  id: number;
  name: string;
  description: string | null;
  tags: string[];
  validated: boolean;
  schedule: string | null;
  lastRunStatus: RunStatus | null;
  lastRunAt: string | null;
  createdBy: "ai" | "human";
  createdAt: string;
  updatedAt: string;
}

export interface TestDetailDTO extends TestDTO {
  filePath: string;
  script: string;
}

export interface RunDTO {
  id: number;
  testId: number | null;
  trigger: RunTrigger;
  status: RunStatus;
  attemptNumber: number;
  maxAttempts: number;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

/**
 * Deliberately has no plaintext/ciphertext field at all, so a handler that
 * returns this type structurally cannot leak a secret value.
 */
export interface CredentialMaskedDTO {
  id: number;
  name: string;
  description: string | null;
  status: "pending" | "fulfilled";
  requestedAt: string;
  fulfilledAt: string | null;
}

export interface ProtectionHeaderDTO {
  id: number;
  headerName: string;
  enabled: boolean;
}

export interface WebhookDTO {
  id: number;
  kind: "discord" | "slack" | "generic";
  url: string;
  enabled: boolean;
  events: Array<"pass" | "fail" | "error">;
}

export interface StatusPageConfigDTO {
  enabled: boolean;
  slug: string | null;
  title: string | null;
  description: string | null;
  testIds: number[];
}

export interface PublicStatusPageDTO {
  title: string;
  description: string | null;
  tests: Array<{ name: string; status: RunStatus | null; lastRunAt: string | null }>;
}

export interface PairDebugSessionDTO {
  id: number;
  status: "starting" | "active" | "stopped";
  startedAt: string;
  stoppedAt: string | null;
  vncWsPath: string | null;
}
