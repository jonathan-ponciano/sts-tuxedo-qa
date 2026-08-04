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
  account_id: number | null;
}

export interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string | null;
  github_id: string | null;
  created_at: string;
}

export interface AccountRow {
  id: number;
  name: string;
  slug: string;
  created_at: string;
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

export function listProjectsForAccount(accountId: number): ProjectRow[] {
  return getRegistryDb()
    .query("SELECT * FROM projects WHERE disabled_at IS NULL AND account_id = ?1 ORDER BY name")
    .all(accountId) as ProjectRow[];
}

export function getProjectStats(projectId: number): ProjectStatsRow | null {
  return getRegistryDb().query("SELECT * FROM project_stats WHERE project_id = ?1").get(projectId) as ProjectStatsRow | null;
}

export function createProject(slug: string, name: string, dbPath: string, accountId: number): ProjectRow {
  const registryDb = getRegistryDb();
  registryDb.run("INSERT INTO projects (slug, name, db_path, account_id) VALUES (?1, ?2, ?3, ?4)", [slug, name, dbPath, accountId]);
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

// ---- auth: users, accounts, sessions ----

export function findUserByEmail(email: string): UserRow | null {
  return getRegistryDb().query("SELECT * FROM users WHERE email = ?1").get(email) as UserRow | null;
}

export function findUserById(id: number): UserRow | null {
  return getRegistryDb().query("SELECT * FROM users WHERE id = ?1").get(id) as UserRow | null;
}

export function createUser(email: string, name: string, passwordHash: string): UserRow {
  const registryDb = getRegistryDb();
  registryDb.run("INSERT INTO users (email, name, password_hash) VALUES (?1, ?2, ?3)", [email, name, passwordHash]);
  const row = findUserByEmail(email);
  if (!row) throw new Error("failed to create user");
  return row;
}

export function countAccounts(): number {
  const row = getRegistryDb().query("SELECT COUNT(*) as n FROM accounts").get() as { n: number };
  return row.n;
}

export function createAccount(name: string, slug: string): AccountRow {
  const registryDb = getRegistryDb();
  registryDb.run("INSERT INTO accounts (name, slug) VALUES (?1, ?2)", [name, slug]);
  const row = registryDb.query("SELECT * FROM accounts WHERE slug = ?1").get(slug) as AccountRow | null;
  if (!row) throw new Error("failed to create account");
  return row;
}

export function addAccountMember(accountId: number, userId: number, role: "owner" | "member" = "owner"): void {
  getRegistryDb().run("INSERT INTO account_members (account_id, user_id, role) VALUES (?1, ?2, ?3)", [accountId, userId, role]);
}

/** A user's accounts, ordered by membership creation (oldest/primary first). */
export function findAccountsForUser(userId: number): AccountRow[] {
  return getRegistryDb()
    .query(
      `SELECT a.* FROM accounts a
       JOIN account_members m ON m.account_id = a.id
       WHERE m.user_id = ?1
       ORDER BY m.created_at ASC`,
    )
    .all(userId) as AccountRow[];
}

export function findAccountById(id: number): AccountRow | null {
  return getRegistryDb().query("SELECT * FROM accounts WHERE id = ?1").get(id) as AccountRow | null;
}

/**
 * Local installs from before auth existed have projects with no owner.
 * The very first account ever created (i.e. the first person to sign up on
 * this instance) adopts them, so upgrading in place doesn't strand existing
 * work behind an account nothing owns.
 */
export function adoptOrphanedProjects(accountId: number): void {
  getRegistryDb().run("UPDATE projects SET account_id = ?1 WHERE account_id IS NULL", [accountId]);
}

export interface SessionRow {
  token: string;
  user_id: number;
  created_at: string;
  expires_at: string;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createSession(userId: number): SessionRow {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  getRegistryDb().run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?1, ?2, ?3)", [token, userId, expiresAt]);
  return { token, user_id: userId, created_at: new Date().toISOString(), expires_at: expiresAt };
}

export function findValidSession(token: string): SessionRow | null {
  const row = getRegistryDb().query("SELECT * FROM sessions WHERE token = ?1").get(token) as SessionRow | null;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(token);
    return null;
  }
  return row;
}

export function deleteSession(token: string): void {
  getRegistryDb().run("DELETE FROM sessions WHERE token = ?1", [token]);
}

// ---- LLM provider credentials (account-level, for the embedded chat agent) ----

export type LlmProvider = "anthropic" | "gemini";

export interface LlmCredentialRow {
  account_id: number;
  provider: LlmProvider;
  secret_blob: Uint8Array;
  created_at: string;
  updated_at: string;
}

export function upsertLlmCredential(accountId: number, provider: LlmProvider, secretBlob: Buffer): void {
  getRegistryDb().run(
    `INSERT INTO llm_credentials (account_id, provider, secret_blob) VALUES (?1, ?2, ?3)
     ON CONFLICT(account_id, provider) DO UPDATE SET secret_blob = excluded.secret_blob, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    [accountId, provider, secretBlob],
  );
}

export function findLlmCredential(accountId: number, provider: LlmProvider): LlmCredentialRow | null {
  return getRegistryDb()
    .query("SELECT * FROM llm_credentials WHERE account_id = ?1 AND provider = ?2")
    .get(accountId, provider) as LlmCredentialRow | null;
}

export function listLlmCredentialProviders(accountId: number): LlmProvider[] {
  const rows = getRegistryDb().query("SELECT provider FROM llm_credentials WHERE account_id = ?1").all(accountId) as {
    provider: LlmProvider;
  }[];
  return rows.map((r) => r.provider);
}

export function deleteLlmCredential(accountId: number, provider: LlmProvider): void {
  getRegistryDb().run("DELETE FROM llm_credentials WHERE account_id = ?1 AND provider = ?2", [accountId, provider]);
}

// ---- repos / repo_links (Fase 1: repo linking) ----

export type RepoProvider = "local" | "github";
export type RepoBuildMethod = "dockerfile" | "node";

export interface RepoRow {
  id: number;
  account_id: number;
  provider: RepoProvider;
  local_path: string | null;
  remote_url: string | null;
  default_branch: string;
  build_method: RepoBuildMethod;
  port: number;
  created_at: string;
}

export interface RepoLinkRow {
  project_id: number;
  repo_id: number;
  branch: string;
  created_at: string;
}

export interface CreateRepoInput {
  accountId: number;
  provider: RepoProvider;
  localPath?: string;
  remoteUrl?: string;
  defaultBranch: string;
  buildMethod: RepoBuildMethod;
  port: number;
  // Already encrypted by the caller (see api/repos.ts) — registry.ts stays
  // crypto-agnostic, same convention as llm_credentials.
  patBlob?: Buffer;
}

export function createRepo(input: CreateRepoInput): RepoRow {
  const registryDb = getRegistryDb();
  const { lastInsertRowid } = registryDb.run(
    `INSERT INTO repos (account_id, provider, local_path, remote_url, default_branch, build_method, port)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    [input.accountId, input.provider, input.localPath ?? null, input.remoteUrl ?? null, input.defaultBranch, input.buildMethod, input.port],
  );
  const repoId = Number(lastInsertRowid);
  if (input.patBlob) {
    registryDb.run("INSERT INTO repo_credentials (repo_id, secret_blob) VALUES (?1, ?2)", [repoId, input.patBlob]);
  }
  const row = registryDb.query("SELECT * FROM repos WHERE id = ?1").get(repoId) as RepoRow | null;
  if (!row) throw new Error("failed to create repo");
  return row;
}

export function findRepoById(id: number): RepoRow | null {
  return getRegistryDb().query("SELECT * FROM repos WHERE id = ?1").get(id) as RepoRow | null;
}

export function findRepoPatBlob(repoId: number): Buffer | null {
  const row = getRegistryDb().query("SELECT secret_blob FROM repo_credentials WHERE repo_id = ?1").get(repoId) as
    | { secret_blob: Uint8Array }
    | null;
  return row ? Buffer.from(row.secret_blob) : null;
}

export function linkRepoToProject(projectId: number, repoId: number, branch: string): RepoLinkRow {
  getRegistryDb().run(
    `INSERT INTO repo_links (project_id, repo_id, branch) VALUES (?1, ?2, ?3)
     ON CONFLICT(project_id) DO UPDATE SET repo_id = excluded.repo_id, branch = excluded.branch`,
    [projectId, repoId, branch],
  );
  const row = getRegistryDb().query("SELECT * FROM repo_links WHERE project_id = ?1").get(projectId) as RepoLinkRow | null;
  if (!row) throw new Error("failed to link repo");
  return row;
}

export function findRepoLinkForProject(projectId: number): (RepoLinkRow & RepoRow) | null {
  return getRegistryDb()
    .query(
      `SELECT r.*, l.project_id, l.repo_id, l.branch, l.created_at as link_created_at
       FROM repo_links l JOIN repos r ON r.id = l.repo_id
       WHERE l.project_id = ?1`,
    )
    .get(projectId) as (RepoLinkRow & RepoRow) | null;
}

export function updateRepoLinkBranch(projectId: number, branch: string): void {
  getRegistryDb().run("UPDATE repo_links SET branch = ?1 WHERE project_id = ?2", [branch, projectId]);
}

export function unlinkRepoFromProject(projectId: number): void {
  getRegistryDb().run("DELETE FROM repo_links WHERE project_id = ?1", [projectId]);
}
