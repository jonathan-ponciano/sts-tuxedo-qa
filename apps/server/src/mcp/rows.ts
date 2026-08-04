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
  schedule_enabled: number;
  source_thread_id: number | null;
  branch: string | null;
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

export interface PairDebugSessionRow {
  id: number;
  status: "starting" | "active" | "stopped";
  started_at: string;
  stopped_at: string | null;
  runner_session_id: string | null;
  draft_test_path: string | null;
}

export interface ChatThreadRow {
  id: number;
  title: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: number;
  thread_id: number;
  role: "user" | "assistant";
  content: string; // JSON — Anthropic content-block array, verbatim
  created_at: string;
}

export interface AgentRunRow {
  id: number;
  thread_id: number;
  status: "running" | "waiting_input" | "completed" | "error";
  waiting_on_credential_id: number | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}
