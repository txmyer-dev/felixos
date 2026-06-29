FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/db/package.json ./packages/db/
COPY packages/auth/package.json ./packages/auth/
RUN --mount=type=cache,id=pnpm-web,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
ARG FELIXOS_API_ORIGIN=http://api:3001
ENV FELIXOS_API_ORIGIN=$FELIXOS_API_ORIGIN
COPY tsconfig.base.json ./
COPY packages/shared-types/src ./packages/shared-types/src
COPY packages/db/src ./packages/db/src
COPY packages/auth/src ./packages/auth/src
COPY apps/web/next.config.ts ./apps/web/
COPY apps/web/tsconfig.json ./apps/web/
COPY apps/web/app ./apps/web/app
COPY apps/web/lib ./apps/web/lib
COPY apps/web/middleware.ts ./apps/web/
WORKDIR /app/apps/web
RUN pnpm build

FROM node:24-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./.next/static
COPY --from=build /app/apps/web/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
