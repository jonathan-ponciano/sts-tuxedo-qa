import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { registryDbPath } from "../config.ts";
import { applyMigrations } from "./migrate.ts";

const MIGRATIONS_DIR = new URL("../../migrations/registry", import.meta.url).pathname;

let db: Database | null = null;

export function getRegistryDb(): Database {
  if (db) return db;
  mkdirSync(dirname(registryDbPath()), { recursive: true });
  db = new Database(registryDbPath());
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  applyMigrations(db, MIGRATIONS_DIR);
  return db;
}

export interface ProjectRow {
  id: number;
  slug: string;
  name: string;
  db_path: string;
  created_at: string;
  disabled_at: string | null;
  last_seen_at: string | null;
  mcp_last_connected_at: string | null;
}

export interface ProjectStatsRow {
  project_id: number;
  test_count: number;
  passing_count: number;
  failing_count: number;
  last_run_at: string | null;
  updated_at: string;
}

export function findProjectBySlug(slug: string): ProjectRow | null {
  return getRegistryDb()
    .query("SELECT * FROM projects WHERE slug = ?1 AND disabled_at IS NULL")
    .get(slug) as ProjectRow | null;
}

export function findProjectById(id: number): ProjectRow | null {
  return getRegistryDb().query("SELECT * FROM projects WHERE id = ?1 AND disabled_at IS NULL").get(id) as ProjectRow | null;
}

/** Public status-page slugs live in their own namespace, distinct from project slugs. */
export function setStatusPageSlug(projectId: number, slug: string): void {
  const db = getRegistryDb();
  db.run("DELETE FROM status_page_slugs WHERE project_id = ?1", [projectId]);
  db.run("INSERT INTO status_page_slugs (slug, project_id) VALUES (?1, ?2)", [slug, projectId]);
}

export function clearStatusPageSlug(projectId: number): void {
  getRegistryDb().run("DELETE FROM status_page_slugs WHERE project_id = ?1", [projectId]);
}

export function findProjectIdByStatusPageSlug(slug: string): number | null {
  const row = getRegistryDb().query("SELECT project_id FROM status_page_slugs WHERE slug = ?1").get(slug) as
    | { project_id: number }
    | null;
  return row?.project_id ?? null;
}

export function listProjects(): ProjectRow[] {
  return getRegistryDb().query("SELECT * FROM projects WHERE disabled_at IS NULL ORDER BY name").all() as ProjectRow[];
}

export function getProjectStats(projectId: number): ProjectStatsRow | null {
  return getRegistryDb().query("SELECT * FROM project_stats WHERE project_id = ?1").get(projectId) as ProjectStatsRow | null;
}

export function createProject(slug: string, name: string, dbPath: string): ProjectRow {
  const registryDb = getRegistryDb();
  registryDb.run("INSERT INTO projects (slug, name, db_path) VALUES (?1, ?2, ?3)", [slug, name, dbPath]);
  const row = findProjectBySlug(slug);
  if (!row) throw new Error("failed to create project");
  registryDb.run("INSERT INTO project_stats (project_id) VALUES (?1)", [row.id]);
  return row;
}

export function touchProjectSeen(id: number): void {
  getRegistryDb().run(
    "UPDATE projects SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
    [id],
  );
}

/**
 * Touched ONLY by the /mcp/:slug route (see mcp/route.ts) — deliberately
 * separate from `touchProjectSeen`, which the dashboard's own REST traffic
 * also triggers. This is the one signal that specifically means "an MCP
 * client actually hit this project's endpoint", which is what the
 * dashboard's connection-status indicator needs.
 */
export function touchMcpConnected(id: number): void {
  getRegistryDb().run(
    "UPDATE projects SET mcp_last_connected_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
    [id],
  );
}

export function updateProjectStats(
  projectId: number,
  stats: { testCount: number; passingCount: number; failingCount: number; lastRunAt: string | null },
): void {
  getRegistryDb().run(
    `INSERT INTO project_stats (project_id, test_count, passing_count, failing_count, last_run_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(project_id) DO UPDATE SET
       test_count = excluded.test_count,
       passing_count = excluded.passing_count,
       failing_count = excluded.failing_count,
       last_run_at = excluded.last_run_at,
       updated_at = excluded.updated_at`,
    [projectId, stats.testCount, stats.passingCount, stats.failingCount, stats.lastRunAt],
  );
}
