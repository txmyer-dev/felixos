FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
# Every workspace manifest must be present for the frozen-lockfile check,
# even though the filtered install only fetches the web dependency graph.
COPY apps/api/package.json ./apps/api/
COPY apps/cli/package.json ./apps/cli/
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/db/package.json ./packages/db/
COPY packages/auth/package.json ./packages/auth/
COPY packages/agent/package.json ./packages/agent/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/skills/package.json ./packages/skills/
RUN --mount=type=cache,id=pnpm-web,target=/pnpm/store pnpm install --frozen-lockfile --filter @felixos/web...

FROM deps AS build
ARG FELIXOS_API_ORIGIN=http://api:3001
ENV FELIXOS_API_ORIGIN=$FELIXOS_API_ORIGIN
COPY tsconfig.base.json ./
COPY packages/shared-types/src ./packages/shared-types/src
COPY apps/web/next.config.ts ./apps/web/
COPY apps/web/tsconfig.json ./apps/web/
COPY apps/web/postcss.config.mjs ./apps/web/
COPY apps/web/proxy.ts ./apps/web/
COPY apps/web/app ./apps/web/app
COPY apps/web/components ./apps/web/components
COPY apps/web/lib ./apps/web/lib
COPY apps/web/public ./apps/web/public
WORKDIR /app/apps/web
RUN pnpm build

FROM node:24-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
# Standalone output preserves the monorepo layout: the server entry and its
# .next/static + public siblings live under apps/web/ inside the bundle.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
