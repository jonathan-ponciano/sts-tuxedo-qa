import { resolve } from "node:path";

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`missing required env var ${name}`);
  return value;
}

export const config = {
  port: Number(env("PORT", "3000")),
  dataDir: resolve(env("DATA_DIR", "./data")),
  masterKeyPath: env("MASTER_KEY_PATH", resolve(env("DATA_DIR", "./data"), "master.key")),
  runnerBaseUrl: env("RUNNER_BASE_URL", "http://localhost:4000"),
  publicBaseUrl: env("PUBLIC_BASE_URL", `http://localhost:${env("PORT", "3000")}`),
  schedulerIntervalMs: Number(env("SCHEDULER_INTERVAL_MS", "60000")),
};

/** Multi-stage Dockerfile copies the built SPA to apps/web/dist alongside this app; absent in dev (Vite serves it directly). */
export const webDistDir = new URL("../../web/dist", import.meta.url).pathname;

export const registryDbPath = () => resolve(config.dataDir, "registry.db");
export const projectDir = (slug: string) => resolve(config.dataDir, "projects", slug);
export const projectDbPath = (slug: string) => resolve(projectDir(slug), "tuxedo.db");
export const projectSpecsDir = (slug: string) => resolve(projectDir(slug), "specs");
export const projectArtifactsDir = (slug: string) => resolve(projectDir(slug), "artifacts");
