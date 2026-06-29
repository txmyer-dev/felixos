# FelixOS Agent Guide

This repo is FelixOS: a TypeScript monorepo for a multi-tenant internal operating system for running an MSP. Agents should treat the plan docs as the product and architecture source of truth, then make small, verifiable changes against GitHub issues.

## Start Here

Read these before coding:

- `README.md` for the repo overview.
- `docs/plans/2026-06-29-001-feat-felixos-architecture-approach-plan.md` for canonical architecture decisions.
- `docs/plans/2026-06-29-002-feat-felixos-foundation-phase-plan.md` for Foundation phase units.
- The relevant GitHub issue body and comments.

The current foundation plan is intentionally horizontal. Do not turn a unit into a vertical product slice unless the issue explicitly asks for it.

## Current Stack

- Package manager: `pnpm`.
- Node runtime: 22 LTS, pinned by `.nvmrc` and `package.json` `engines.node`.
- Build system: Turborepo.
- Language: TypeScript end to end.
- Apps: `apps/web`, `apps/api`, `apps/cli`.
- Packages: `packages/shared-types`, `packages/db`, `packages/auth`.
- Planned runtime: Next.js web, Fastify API, Drizzle/Postgres 18 + pgvector, passwordless TOTP auth, Postgres RLS.

## Workspace Conventions

These wiring decisions are locked. Every agent follows them identically — do not introduce a competing pattern.

### Module resolution: internal packages consume source

Internal packages (`packages/shared-types`, `packages/db`, `packages/auth`) are private and never published. Consumers import their TypeScript **source**, not a built `dist`:

- `@felixos/*` aliases and each package's `package.json` `exports`/`main`/`types` both resolve to `src` (e.g. `src/index.ts`). Internal libs have no `dist` build.
- Consumers transpile: `apps/web` (Next.js) via `transpilePackages: ['@felixos/*']`; `apps/api` and `apps/cli` via `tsx` in dev and a bundler (tsup/esbuild) for prod; tests via Vitest reading TS directly.
- Typecheck with `tsc --noEmit`. Never rely on a generated `dist` from an internal package.
- Do **not** reintroduce the split where typecheck resolves to `src` but runtime resolves to `dist` — typecheck and runtime must resolve to the same files. If a package ever needs to be published or extracted (e.g. for the productized version), convert it to TS project references (`composite` + `references`) at that point, not before.

### Linting: ESLint 10 + flat config

- ESLint 10 (`eslint` ^10) with **flat config** (`eslint.config.js`) — not the legacy `.eslintrc`. `typescript-eslint` supplies the TS rules.
- One root flat config shared across the workspace; packages do not each define their own lint setup.
- Keep `@typescript-eslint/consistent-type-imports` (it pairs with `isolatedModules`).

## Standard Commands

Run from the repo root:

```powershell
pnpm install
pnpm turbo run build lint typecheck
pnpm turbo run test
pnpm format:check
```

The per-issue gate for Foundation work is:

```powershell
pnpm turbo run lint typecheck test build
```

If a unit has a stronger verification contract in the plan, run that too.

## Issue Workflow

All work should map to a GitHub issue in `txmyer-dev/felixos`.

- Read the issue, linked plan docs, and relevant local files before editing.
- Keep one PR focused on one implementation unit unless the user explicitly asks otherwise.
- Reference issues as `#N` in commit bodies and PR bodies.
- Use `Closes #N` only in the PR body or final closing commit when the issue is genuinely done.
- If a plan contract seems wrong or underspecified, stop and surface the question before changing the contract.

Branch names should follow:

```text
<type>/<issue-number>-<short-slug>
```

Examples:

- `feat/1-monorepo-scaffold`
- `feat/4-rls-scoped-client`
- `fix/5-totp-replay-guard`

Commit messages should be conventional:

```text
<type>(<scope>): <imperative subject>
```

Common scopes: `workspace`, `shared-types`, `db`, `auth`, `api`, `web`, `cli`, `ci`, `docs`.

## Tier Rules

Use the risk of the change to choose process depth.

### Routine

Examples: copy edits, lint fixes, config cleanup, package metadata, scaffold files that mirror an established pattern.

Expected process: implement directly, run the relevant gate, summarize clearly.

### Standard

Examples: shared type additions, normal API endpoints, UI shell work, package wiring, non-security utilities.

Expected process: read plan and local patterns, implement with focused tests or type coverage, run the gate, note any deferred work.

### Safety-Critical

Examples:

- `packages/db/src/schema/**`
- `packages/db/src/rls.ts`
- `packages/db/src/client.ts`
- `packages/db/src/context.ts`
- `packages/db/migrations/**`
- `packages/auth/src/**`
- `apps/api/src/middleware/**`
- Session handling, tenant resolution, recovery-code handling, privileged database clients, migrations, and any import guard that protects tenant isolation.

Expected process: test-first where practical, real Postgres for RLS/isolation tests, no mocks for security claims, and mandatory review before merge.

These paths are safety-critical because FelixOS is multi-tenant from the first row. A mistake can leak tenant data, bypass auth, corrupt the entity spine, or silently weaken the guarantees other agents depend on.

## Foundation Contracts

Honor these contracts from the plan:

- Every tenant-scoped table carries `tenant_id`.
- Tenant isolation is enforced by Postgres RLS, not only application filters.
- App queries must use an ALS-scoped non-privileged client.
- Privileged database access is only for migrations, provisioning, seed, and operator recovery CLI.
- Passwordless TOTP is the sole tenant login factor; no passwords or password resets.
- Recovery codes are high-entropy, hashed, and single-use.
- `packages/shared-types` is the shared contract package. Keep it dependency-free and stable.
- `SkillDescriptor` remains minimal during Foundation unless a later phase explicitly expands it.
- pgvector is enabled in Foundation, but knowledge and embedding tables are Phase 2.

If changing one of these would be necessary, pause and ask before coding further.

## Testing Expectations

Use Vitest or an equivalent TypeScript runner when tests are introduced.

- Pure utilities: unit tests.
- API behavior: request-level integration tests.
- DB schema, RLS, and isolation: tests against real Postgres 18 + pgvector.
- Web login and authenticated shell: browser-level verification once UI exists.
- Multi-page auth or route-boundary work: add end-to-end coverage, not just manual clicking.

For U4 and later, tenant-isolation tests are blocking. At minimum, cover:

- Tenant A cannot read tenant B.
- No tenant context denies by default.
- Reused pooled connections do not leak stale tenant context.
- App role cannot bypass RLS.
- Write policies prevent cross-tenant insert/update/delete.

## Code Style

- Prefer existing repo patterns over new abstractions.
- Keep changes scoped to the issue and phase unit.
- Do not add production dependencies without a clear reason.
- Do not put secrets in repo files, docs, logs, or examples.
- Do not copy private LifeOS context into the repo.
- Keep shared packages importable by dependents through `@felixos/*` aliases.
- Use structured parsers and framework APIs instead of ad hoc string handling where possible.
- Comments should explain non-obvious decisions, not restate code.

## Frontend Expectations

The web app is a working product surface, not a marketing landing page.

- Build the usable shell or flow first.
- Keep operational UI quiet, dense, and scannable.
- Use established controls: inputs, segmented controls, toggles, tabs, menus, and icon buttons where appropriate.
- Avoid decorative cards, nested cards, one-note palettes, and oversized hero layouts for internal tools.
- Verify responsive layout and text fit before calling UI work done.

## PR Body Checklist

Every PR should include:

- `Closes #N` or `Refs #N`.
- Plan reference.
- Summary of changes.
- Test plan with exact commands run.
- Notes for schema migrations, env vars, or out-of-scope follow-ups.

For UI-visible changes, include screenshots or a short demo note when practical.

## Documentation and Learnings

Search `docs/plans/` before re-solving architecture questions.

When a non-trivial implementation decision or debugging lesson emerges, add or update a focused note under:

```text
docs/solutions/
```

Use this for durable patterns, pitfalls, and decisions future agents should not have to rediscover. Do not create broad docs churn for routine changes.

## Stop Conditions

Stop and ask before:

- Changing frozen shared contracts after dependent work begins.
- Weakening tenant isolation, auth, recovery, or privileged-client boundaries.
- Deleting data, files, migrations, or user-owned changes.
- Publishing, deploying, sending external messages, or changing credentials.
- Introducing a new service, datastore, framework, or major dependency not in the plan.

When in doubt, preserve the plan contract and surface the tradeoff.
