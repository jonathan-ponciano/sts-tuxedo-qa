# Base on the official Playwright image (matching apps/runner/package.json's pinned
# @playwright/test version) — it already solves the hard problem of headed-browser OS
# deps, which is exactly what a Bun-only base image would not give us for free.
FROM mcr.microsoft.com/playwright:v1.62.0-noble

# git + docker.io (the `docker` CLI) back Fase 1's sandbox provisioning
# (apps/runner/src/sandbox/provision.ts) — cloning repos and driving sibling
# containers via the host's docker.sock (bind-mounted at container start,
# see the run command in the deploy docs). No dockerd of our own: commands
# issued here execute on the HOST's daemon, "sibling containers", not real
# Docker-in-Docker.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates unzip git docker.io \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"
ENV BUN_INSTALL_CACHE_DIR=/root/.bun/install/cache

WORKDIR /app

# Copy just the workspace manifests first so `bun install` is cached unless a
# package.json actually changed — apps/server and apps/web are only needed by
# name here (bun workspaces resolves the whole tree), never built into this image.
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/runner/package.json apps/runner/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/runner apps/runner

WORKDIR /app/apps/runner

ENV PORT=4000
ENV DATA_DIR=/data
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD curl -fsS http://localhost:4000/internal/health || exit 1

CMD ["bun", "run", "src/main.ts"]
