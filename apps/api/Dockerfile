FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
# Every workspace manifest must be present for the frozen-lockfile check,
# even though the filtered install only fetches the API dependency graph.
COPY apps/api/package.json ./apps/api/
COPY apps/cli/package.json ./apps/cli/
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/db/package.json ./packages/db/
COPY packages/auth/package.json ./packages/auth/
COPY packages/agent/package.json ./packages/agent/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/skills/package.json ./packages/skills/
RUN --mount=type=cache,id=pnpm-api,target=/pnpm/store pnpm install --frozen-lockfile --filter @felixos/api...

FROM node:24-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
# shared-types and integrations have no dependencies, so pnpm creates no
# node_modules directory for them — only these four have one to copy.
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/auth/node_modules ./packages/auth/node_modules
COPY --from=deps /app/packages/agent/node_modules ./packages/agent/node_modules
COPY --from=deps /app/packages/skills/node_modules ./packages/skills/node_modules
COPY tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/db/package.json ./packages/db/
COPY packages/auth/package.json ./packages/auth/
COPY packages/agent/package.json ./packages/agent/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/skills/package.json ./packages/skills/
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/src ./packages/shared-types/src
COPY packages/db/src ./packages/db/src
COPY packages/auth/src ./packages/auth/src
COPY packages/agent/src ./packages/agent/src
COPY packages/integrations/src ./packages/integrations/src
COPY packages/skills/src ./packages/skills/src
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "--import=tsx/esm", "src/index.ts"]
