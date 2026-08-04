-- Separate from `schedule IS NULL` on purpose: disabling a scheduled test
-- shouldn't drop its cron config, just pause it — re-enabling later restores
-- the same schedule instead of asking the user to recall/retype it.
ALTER TABLE tests ADD COLUMN schedule_enabled INTEGER NOT NULL DEFAULT 1;

-- Which chat conversation (if any) produced this test via "salvar como teste
-- fixo" — nullable because tests created directly via create_test (MCP or
-- outside a chat turn) have no originating thread.
ALTER TABLE tests ADD COLUMN source_thread_id INTEGER REFERENCES chat_threads(id);

-- Unused until repo-linking (Fase 1) exists, but the column lives here now
-- per the promote-to-scheduled design so a later branch-editing feature is
-- an UPDATE, not a migration.
ALTER TABLE tests ADD COLUMN branch TEXT;
