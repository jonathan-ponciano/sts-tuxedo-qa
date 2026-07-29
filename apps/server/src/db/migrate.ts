import type { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Minimal numbered-.sql-file migration runner. Tracks the applied version in
 * a `meta` table so it's safe to call on every db open (registry boot, or
 * whenever a project db is first touched).
 */
export function applyMigrations(db: Database, migrationsDir: string): void {
  db.run("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const row = db.query("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | null;
  const currentVersion = row ? Number(row.value) : 0;

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const version = Number(file.split("_")[0]);
    if (Number.isNaN(version) || version <= currentVersion) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const applyOne = db.transaction(() => {
      db.run(sql);
      db.run(
        "INSERT INTO meta (key, value) VALUES ('schema_version', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [String(version)],
      );
    });
    applyOne();
  }
}
