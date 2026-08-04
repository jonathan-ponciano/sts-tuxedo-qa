import { Hono } from "hono";
import { z } from "zod";
import type { RepoDTO, RepoLinkDTO } from "@tuxedo-qa/shared";
import { encryptSecret } from "../crypto/index.ts";
import {
  createRepo,
  findRepoLinkForProject,
  findRepoPatBlob,
  linkRepoToProject,
  unlinkRepoFromProject,
  updateRepoLinkBranch,
  type RepoLinkRow,
  type RepoRow,
} from "../db/registry.ts";

export const repoRouter = new Hono();

function toRepoDTO(row: RepoRow): RepoDTO {
  return {
    id: row.id,
    provider: row.provider,
    localPath: row.local_path,
    remoteUrl: row.remote_url,
    buildMethod: row.build_method,
    port: row.port,
    hasCredential: findRepoPatBlob(row.id) !== null,
  };
}

function toLinkDTO(row: RepoLinkRow & RepoRow): RepoLinkDTO {
  return { repo: toRepoDTO(row), branch: row.branch };
}

repoRouter.get("/", (c) => {
  const ctx = c.get("project");
  const link = findRepoLinkForProject(ctx.id);
  return c.json({ link: link ? toLinkDTO(link) : null });
});

const createSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("local"),
    localPath: z.string().min(1),
    branch: z.string().min(1),
    buildMethod: z.enum(["dockerfile", "node"]),
    port: z.number().int().positive(),
  }),
  z.object({
    provider: z.literal("github"),
    remoteUrl: z.string().url(),
    pat: z.string().optional(),
    branch: z.string().min(1),
    buildMethod: z.enum(["dockerfile", "node"]),
    port: z.number().int().positive(),
  }),
]);

repoRouter.post("/", async (c) => {
  const ctx = c.get("project");
  const parsed = createSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const data = parsed.data;

  const repo = createRepo({
    accountId: c.get("account").id,
    provider: data.provider,
    localPath: data.provider === "local" ? data.localPath : undefined,
    remoteUrl: data.provider === "github" ? data.remoteUrl : undefined,
    defaultBranch: data.branch,
    buildMethod: data.buildMethod,
    port: data.port,
    patBlob: data.provider === "github" && data.pat ? encryptSecret(data.pat) : undefined,
  });
  linkRepoToProject(ctx.id, repo.id, data.branch);

  return c.json({ link: { repo: toRepoDTO(repo), branch: data.branch } satisfies RepoLinkDTO }, 201);
});

const branchSchema = z.object({ branch: z.string().min(1) });

repoRouter.patch("/", async (c) => {
  const ctx = c.get("project");
  const parsed = branchSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const link = findRepoLinkForProject(ctx.id);
  if (!link) return c.json({ error: "no_repo_linked" }, 404);
  updateRepoLinkBranch(ctx.id, parsed.data.branch);
  return c.json({ link: toLinkDTO({ ...link, branch: parsed.data.branch }) });
});

repoRouter.delete("/", (c) => {
  const ctx = c.get("project");
  unlinkRepoFromProject(ctx.id);
  return c.json({ deleted: true });
});
