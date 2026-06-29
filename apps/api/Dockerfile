FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/db/package.json ./packages/db/
COPY packages/auth/package.json ./packages/auth/
RUN --mount=type=cache,id=pnpm-api,target=/pnpm/store pnpm install --frozen-lockfile

FROM node:24-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY tsconfig.base.json ./
COPY packages/shared-types/src ./packages/shared-types/src
COPY packages/db/src ./packages/db/src
COPY packages/auth/src ./packages/auth/src
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/

EXPOSE 3001
CMD ["node", "--import=tsx/esm", "apps/api/src/index.ts"]
