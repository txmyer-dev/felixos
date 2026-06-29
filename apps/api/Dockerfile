FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/cli/package.json ./apps/cli/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/db/package.json ./packages/db/
COPY packages/auth/package.json ./packages/auth/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared-types/src ./packages/shared-types/src
COPY packages/db/src ./packages/db/src
COPY packages/auth/src ./packages/auth/src
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/
WORKDIR /app/apps/api
RUN pnpm build

FROM node:24-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages

EXPOSE 3001
CMD ["node", "dist/index.js"]
