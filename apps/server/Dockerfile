# ---- stage 1: shared deps + server source (also the dev-mode target) ----
FROM oven/bun:1-slim AS deps
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/runner/package.json apps/runner/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/server apps/server
WORKDIR /app/apps/server

# ---- stage 2: build the SPA (prod only) ----
FROM deps AS web-build
WORKDIR /app
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN bun run build

# ---- stage 3: prod runtime ----
FROM deps AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY --from=web-build /app/apps/web/dist /app/apps/web/dist

WORKDIR /app/apps/server
ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD curl -fsS http://localhost:3000/healthz || exit 1

CMD ["bun", "run", "src/main.ts"]
