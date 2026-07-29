CREATE TABLE tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  description TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  validated INTEGER NOT NULL DEFAULT 0,
  schedule TEXT,
  next_due_at TEXT,
  created_by TEXT NOT NULL DEFAULT 'ai' CHECK (created_by IN ('ai', 'human')),
  last_run_id INTEGER,
  last_run_status TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE test_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'scheduled', 'ci', 'run_until_pass')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'passed', 'failed', 'error', 'timeout')),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT,
  duration_ms INTEGER,
  artifacts_path TEXT
);

CREATE INDEX idx_test_runs_test_id ON test_runs(test_id);

CREATE TABLE credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  secret_blob BLOB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled')),
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fulfilled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE protection_headers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  header_name TEXT NOT NULL,
  secret_blob BLOB NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('discord', 'slack', 'generic')),
  url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  events TEXT NOT NULL DEFAULT '["fail","error"]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE status_page_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  slug TEXT UNIQUE,
  title TEXT,
  description TEXT
);

CREATE TABLE status_page_tests (
  config_id INTEGER NOT NULL DEFAULT 1 REFERENCES status_page_config(id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (config_id, test_id)
);

CREATE TABLE pair_debug_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'starting' CHECK (status IN ('starting', 'active', 'stopped')),
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  stopped_at TEXT,
  runner_session_id TEXT,
  draft_test_path TEXT
);

CREATE TABLE pair_debug_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES pair_debug_sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('console', 'network', 'nav', 'click')),
  payload TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_pair_debug_events_session ON pair_debug_events(session_id, seq);
