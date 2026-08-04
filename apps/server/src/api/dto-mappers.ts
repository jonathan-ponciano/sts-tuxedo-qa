import type { CredentialMaskedDTO, RunDTO, RunStatus, RunTrigger, TestDTO, TestDetailDTO } from "@tuxedo-qa/shared";
import type { CredentialRow, TestRow, TestRunRow } from "../mcp/rows.ts";

export function testRowToDTO(row: TestRow): TestDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: JSON.parse(row.tags) as string[],
    validated: Boolean(row.validated),
    schedule: row.schedule,
    scheduleEnabled: Boolean(row.schedule_enabled),
    sourceThreadId: row.source_thread_id,
    branch: row.branch,
    lastRunStatus: (row.last_run_status as RunStatus | null) ?? null,
    lastRunAt: row.last_run_at ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function testRowToDetailDTO(row: TestRow, script: string): TestDetailDTO {
  return { ...testRowToDTO(row), filePath: row.file_path, script };
}

export function runRowToDTO(row: TestRunRow): RunDTO {
  return {
    id: row.id,
    testId: row.test_id,
    trigger: row.trigger as RunTrigger,
    status: row.status as RunStatus,
    attemptNumber: row.attempt_number,
    maxAttempts: row.max_attempts,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
  };
}

export function credentialRowToMaskedDTO(
  row: Pick<CredentialRow, "id" | "name" | "description" | "status" | "requested_at" | "fulfilled_at">,
): CredentialMaskedDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    requestedAt: row.requested_at,
    fulfilledAt: row.fulfilled_at,
  };
}
