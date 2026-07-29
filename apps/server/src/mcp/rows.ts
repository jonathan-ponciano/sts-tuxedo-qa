export interface TestRow {
  id: number;
  name: string;
  file_path: string;
  description: string | null;
  tags: string; // JSON array
  validated: number;
  schedule: string | null;
  next_due_at: string | null;
  created_by: "ai" | "human";
  last_run_id: number | null;
  last_run_status: string | null;
  created_at: string;
  updated_at: string;
  last_run_at?: string | null; // joined from test_runs, not a real column
}

export interface TestRunRow {
  id: number;
  test_id: number | null;
  trigger: string;
  status: string;
  attempt_number: number;
  max_attempts: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  artifacts_path: string | null;
}

export interface CredentialRow {
  id: number;
  name: string;
  description: string | null;
  secret_blob: Uint8Array | null;
  status: "pending" | "fulfilled";
  requested_at: string;
  fulfilled_at: string | null;
}
