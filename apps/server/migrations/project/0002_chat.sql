CREATE TABLE chat_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- `content` holds a JSON array of Anthropic Messages API content blocks
-- (text / tool_use / tool_result) verbatim, so the thread can be replayed
-- straight back into the API on the next turn without any reshaping.
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_chat_messages_thread ON chat_messages(thread_id, id);

-- One row per turn the agent loop runs (a "turn" = one user message through
-- to the next stop, which may itself span several tool_use round-trips with
-- the model). `waiting_on_credential_id` is set when a `request_credential`
-- call inside this turn is still pending — the loop parks here instead of
-- polling, and a separate credential-fulfilled event resumes it.
CREATE TABLE agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'waiting_input', 'completed', 'error')),
  waiting_on_credential_id INTEGER REFERENCES credentials(id),
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT
);

CREATE INDEX idx_agent_runs_thread ON agent_runs(thread_id);
