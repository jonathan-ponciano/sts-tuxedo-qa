import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { projectArtifactsDir, projectDbPath, projectSpecsDir } from "../config.ts";
import { applyMigrations } from "./migrate.ts";

const MIGRATIONS_DIR = new URL("../../migrations/project", import.meta.url).pathname;

/**
 * LRU pool of per-project SQLite handles, keyed by `${id}:${slug}` (not slug
 * alone) so a deleted-then-recreated slug can never be served a stale
 * connection. Map insertion order doubles as recency order.
 */
const MAX_POOL_SIZE = 50;
const pool = new Map<string, Database>();

function poolKey(id: number, slug: string): string {
  return `${id}:${slug}`;
}

export function getProjectDb(id: number, slug: string): Database {
  const key = poolKey(id, slug);
  const existing = pool.get(key);
  if (existing) {
    pool.delete(key);
    pool.set(key, existing);
    return existing;
  }

  mkdirSync(projectSpecsDir(slug), { recursive: true });
  mkdirSync(projectArtifactsDir(slug), { recursive: true });
  const db = new Database(projectDbPath(slug));
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  applyMigrations(db, MIGRATIONS_DIR);

  if (pool.size >= MAX_POOL_SIZE) {
    const oldestKey = pool.keys().next().value;
    if (oldestKey !== undefined) {
      pool.get(oldestKey)?.close();
      pool.delete(oldestKey);
    }
  }
  pool.set(key, db);
  return db;
}

export function evictProjectDb(id: number, slug: string): void {
  const key = poolKey(id, slug);
  pool.get(key)?.close();
  pool.delete(key);
}
