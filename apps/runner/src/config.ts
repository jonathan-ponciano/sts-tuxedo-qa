import { resolve } from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  dataDir: resolve(process.env.DATA_DIR ?? "./data"),
  // The HOST-side path bind-mounted to `dataDir` inside this container.
  // `docker run -v <src>:<dst>` issued against the host's docker.sock (see
  // sandbox/provision.ts) needs the HOST's own path, not this container's
  // view of it — the two only coincide by accident.  Required for the
  // 'github' repo provider (clones happen under dataDir); not needed for
  // 'local' repos, whose path is already host-side by definition.
  hostDataDir: process.env.HOST_DATA_DIR,
  runnerContainerName: process.env.RUNNER_CONTAINER_NAME ?? "tuxedo-runner",
};

export const projectDir = (slug: string) => resolve(config.dataDir, "projects", slug);
export const projectSpecsDir = (slug: string) => resolve(projectDir(slug), "specs");
export const projectArtifactsDir = (slug: string) => resolve(projectDir(slug), "artifacts");
