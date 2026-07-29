import { resolve } from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  dataDir: resolve(process.env.DATA_DIR ?? "./data"),
};

export const projectDir = (slug: string) => resolve(config.dataDir, "projects", slug);
export const projectSpecsDir = (slug: string) => resolve(projectDir(slug), "specs");
export const projectArtifactsDir = (slug: string) => resolve(projectDir(slug), "artifacts");
