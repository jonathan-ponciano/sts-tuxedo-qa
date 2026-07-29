CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  db_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  disabled_at TEXT,
  last_seen_at TEXT
);

CREATE TABLE project_stats (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  test_count INTEGER NOT NULL DEFAULT 0,
  passing_count INTEGER NOT NULL DEFAULT 0,
  failing_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
