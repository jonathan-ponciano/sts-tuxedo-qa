import { Hono } from "hono";
import { credentialsRouter } from "./credentials.ts";
import { mcpStatusRouter } from "./mcp-status.ts";
import { projectMiddleware } from "./middleware.ts";
import { pairDebugRouter } from "./pair-debug.ts";
import { projectsRouter } from "./projects.ts";
import { protectionHeadersRouter } from "./protection-headers.ts";
import { runsRouter } from "./runs.ts";
import { publicStatusRouter, statusPageRouter } from "./status-page.ts";
import { testsRouter } from "./tests.ts";
import { webhooksRouter } from "./webhooks.ts";

export const apiRoute = new Hono();

apiRoute.route("/projects", projectsRouter);
apiRoute.route("/public/status", publicStatusRouter);

const projectScoped = new Hono();
projectScoped.use("*", projectMiddleware);
projectScoped.route("/tests", testsRouter);
projectScoped.route("/runs", runsRouter);
projectScoped.route("/credentials", credentialsRouter);
projectScoped.route("/protection-headers", protectionHeadersRouter);
projectScoped.route("/webhooks", webhooksRouter);
projectScoped.route("/status-page-config", statusPageRouter);
projectScoped.route("/pair-debug", pairDebugRouter);
projectScoped.route("/mcp-status", mcpStatusRouter);

apiRoute.route("/projects/:slug", projectScoped);
