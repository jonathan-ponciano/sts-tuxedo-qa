-- v1 assumes one repo per project (repo_links.project_id is the PK, not a
-- normal FK column) — multi-repo-per-project is explicitly deferred per the
-- pivot plan, so this simpler shape avoids modeling a cardinality nothing
-- uses yet.
CREATE TABLE repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('local', 'github')),
  -- Exactly one of these is set, depending on provider — a host filesystem
  -- path (bind-mounted directly, no clone) for 'local', or a git remote URL
  -- (cloned into this install's own data dir) for 'github'.
  local_path TEXT,
  remote_url TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  -- v1 has the user pick this explicitly instead of sniffing the repo for a
  -- Dockerfile — auto-detection needs the runner to peek at a filesystem it
  -- doesn't otherwise have access to (see provision.ts), and is not worth
  -- the extra moving part yet.
  build_method TEXT NOT NULL CHECK (build_method IN ('dockerfile', 'node')),
  port INTEGER NOT NULL DEFAULT 3000,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- PAT only in v1, not full GitHub OAuth — same encrypted-blob pattern as
-- credentials/protection_headers.
CREATE TABLE repo_credentials (
  repo_id INTEGER PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
  secret_blob BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE repo_links (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  branch TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
