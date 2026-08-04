import { Hono } from "hono";
import { accountRouter } from "./account.ts";
import { authRoute } from "./auth.ts";
import { chatRouter } from "./chat.ts";
import { credentialsRouter } from "./credentials.ts";
import { mcpStatusRouter } from "./mcp-status.ts";
import { authMiddleware, projectMiddleware } from "./middleware.ts";
import { pairDebugRouter } from "./pair-debug.ts";
import { projectsRouter } from "./projects.ts";
import { protectionHeadersRouter } from "./protection-headers.ts";
import { runsRouter } from "./runs.ts";
import { publicStatusRouter, statusPageRouter } from "./status-page.ts";
import { testsRouter } from "./tests.ts";
import { webhooksRouter } from "./webhooks.ts";

export const apiRoute = new Hono();

// Unauthenticated on purpose: signup/login/logout, and the public status
// page (its own separate serializer — see status-page.ts — never the
// authenticated project view).
apiRoute.route("/auth", authRoute);
apiRoute.route("/public/status", publicStatusRouter);
apiRoute.route("/account", accountRouter);

apiRoute.route("/projects", projectsRouter);

const projectScoped = new Hono();
// authMiddleware must run before projectMiddleware — the latter reads
// c.get("account") to scope the lookup.
projectScoped.use("*", authMiddleware);
projectScoped.use("*", projectMiddleware);
projectScoped.route("/tests", testsRouter);
projectScoped.route("/runs", runsRouter);
projectScoped.route("/credentials", credentialsRouter);
projectScoped.route("/protection-headers", protectionHeadersRouter);
projectScoped.route("/webhooks", webhooksRouter);
projectScoped.route("/status-page-config", statusPageRouter);
projectScoped.route("/pair-debug", pairDebugRouter);
projectScoped.route("/mcp-status", mcpStatusRouter);
projectScoped.route("/chat", chatRouter);

apiRoute.route("/projects/:slug", projectScoped);
