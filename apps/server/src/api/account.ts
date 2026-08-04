import { Hono } from "hono";
import { z } from "zod";
import { encryptSecret } from "../crypto/index.ts";
import { deleteLlmCredential, listLlmCredentialProviders, upsertLlmCredential, type LlmProvider } from "../db/registry.ts";
import { authMiddleware } from "./middleware.ts";

export const accountRouter = new Hono();
accountRouter.use("*", authMiddleware);

const providerParam = z.enum(["anthropic", "gemini"]);

accountRouter.get("/llm-credentials", (c) => {
  const providers = listLlmCredentialProviders(c.get("account").id);
  return c.json({ providers });
});

const saveSchema = z.object({ apiKey: z.string().min(1) });

accountRouter.put("/llm-credentials/:provider", async (c) => {
  const parsedProvider = providerParam.safeParse(c.req.param("provider"));
  if (!parsedProvider.success) return c.json({ error: "invalid_provider" }, 400);
  const parsed = saveSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);

  upsertLlmCredential(c.get("account").id, parsedProvider.data as LlmProvider, encryptSecret(parsed.data.apiKey));
  return c.json({ ok: true });
});

accountRouter.delete("/llm-credentials/:provider", (c) => {
  const parsedProvider = providerParam.safeParse(c.req.param("provider"));
  if (!parsedProvider.success) return c.json({ error: "invalid_provider" }, 400);
  deleteLlmCredential(c.get("account").id, parsedProvider.data as LlmProvider);
  return c.json({ ok: true });
});
