# FelixOS Agent Guide

This repo is FelixOS: a TypeScript monorepo for a multi-tenant internal operating system for running an MSP. Agents should treat the plan docs as the product and architecture source of truth, then make small, verifiable changes against GitHub issues.

# This is Next.js App Router + Node 24

`apps/web` uses the **App Router** (`app/` directory, Server Components, `use client` boundary) — not the Pages Router. Training data skews toward Pages Router patterns; read the relevant `app/` conventions before writing any route, layout, or data-fetching code.

Node runtime is **24**, not 22. Earlier scaffold tooling defaulted to 22; there was no project requirement behind that choice. Keep local, CI, and deploy runtime checks aligned on 24.

---

## Start Here

Read these before coding:

- `README.md` for the repo overview.
- `docs/plans/2026-06-29-001-feat-felixos-architecture-approach-plan.md` for canonical architecture decisions.
- `docs/plans/2026-06-29-002-feat-felixos-foundation-phase-plan.md` for Foundation phase units.
- The relevant GitHub issue body and comments.

The current foundation plan is intentionally horizontal. Do not turn a unit into a vertical product slice unless the issue explicitly asks for it.

## Current Stack

- Package manager: `pnpm`.
- Node runtime: 24, pinned by `.nvmrc` and `package.json` `engines.node`.
- Build system: Turborepo.
- Language: TypeScript end to end.
- Apps: `apps/web`, `apps/api`, `apps/cli`.
- Packages: `packages/shared-types`, `packages/db`, `packages/auth`.
- Planned runtime: Next.js web (App Router), Fastify API, Drizzle/Postgres 18 + pgvector, passwordless TOTP auth, Postgres RLS.

## Workspace Conventions

These wiring decisions are locked. Every agent follows them identically — do not introduce a competing pattern.

### Module resolution: internal packages consume source

Internal packages (`packages/shared-types`, `packages/db`, `packages/auth`) are private and never published. Consumers import their TypeScript **source**, not a built `dist`:

- `@felixos/*` aliases and each package's `package.json` `exports`/`main`/`types` both resolve to `src` (e.g. `src/index.ts`). Internal libs have no `dist` build.
- Consumers transpile: `apps/web` (Next.js) via `transpilePackages: ['@felixos/*']`; `apps/api` and `apps/cli` via `tsx` in dev and a bundler (tsup/esbuild) for prod; tests via Vitest reading TS directly.
- Typecheck with `tsc --noEmit`. Never rely on a generated `dist` from an internal package.
- Do **not** reintroduce the split where typecheck resolves to `src` but runtime resolves to `dist` — typecheck and runtime must resolve to the same files. If a package ever needs to be published or extracted, convert it to TS project references (`composite` + `references`) at that point, not before.

### Linting: ESLint 10 + flat config

- ESLint 10 (`eslint` ^10) with **flat config** (`eslint.config.js`) — not the legacy `.eslintrc`. `typescript-eslint` supplies the TS rules.
- One root flat config shared across the workspace; packages do not each define their own lint setup.
- Keep `@typescript-eslint/consistent-type-imports` (it pairs with `isolatedModules`).

## Standard Commands

Run from the repo root:

```bash
pnpm install
pnpm turbo run build lint typecheck
pnpm turbo run test
pnpm format:check
```

The per-issue gate for Foundation work is:

```bash
pnpm turbo run lint typecheck test build
```

If a unit has a stronger verification contract in the plan, run that too.

---

## Development process

This repo uses the **compound-engineering** plugin (`/ce-*` skills) as the spine of every change, with **GitHub Issues** tracked on a **GitHub Projects v2 board** (`txmyer-dev/felixos` — monorepo, so a board keeps cross-package issues organized). Default end-to-end pipeline:

```
[GitHub Issue #N created]
  → /ce-brainstorm (safety-critical or cross-subsystem work; skip for standard/routine)
  → /ce-plan
  → [/ce-doc-review on the plan — for safety-critical or multi-unit plans]
  → git checkout -b <type>/<issue-number>-<slug>  (Projects board: move #N to In Progress)
  → [/ce-frontend-design — for any UI-visible work, before /ce-work]
  → /ce-work (commits reference #N)
  → [/ce-debug if bugs surface — loop until green]
  → /ce-simplify-code
  → /ce-test-browser (for web UI changes)
  → /ce-code-review
  → /ce-commit-push-pr (PR body includes "Closes #N") → (Projects board: move #N to In Review)
  → /ce-resolve-pr-feedback — MANDATORY: read + fix-or-reply + resolve every human and
      Copilot/automated-reviewer thread before merge. Do not merge with any thread open.
  → [merge PR — every thread resolved] → #N auto-closes → board auto-moves to Done
  → /ce-compound (non-trivial work — writes to docs/solutions/)
```

**One PR in flight at a time — merge before moving on.** Take each unit all the way through: brainstorm → … → merge → compound. Parallel branches are for isolation, not for stacking un-merged work.

> **Plugin version:** calibrated against `compound-engineering` v3.11.1 (2026-06). If skill behavior diverges from this doc, the plugin wins — re-read the relevant skill at `~/.claude/plugins/cache/compound-engineering-plugin/compound-engineering/<ver>/skills/<skill>/SKILL.md` and update this doc.

> **Branching:** this repo uses traditional feature branches (`git checkout -b`), not git worktrees. Do not invoke `/ce-worktree`.

### Without the compound-engineering plugin

The `/ce-*` commands belong to the compound-engineering plugin — recommended for all agents on this repo, but not required. The process is achievable with plain git + the GitHub CLI (`gh`).

**To install the plugin** (once per machine):

1. `/plugin marketplace add EveryInc/compound-engineering-plugin`
2. `/plugin install compound-engineering`
3. `/ce-setup` from the repo root to check tools and bootstrap config.

**Manual fallback for each pipeline step:**

| Plugin command | Manual equivalent |
|---|---|
| `/ce-brainstorm` | Discuss in the GitHub issue comment or a design doc before writing code. Goal: alignment on user-visible behavior and scope before the first commit. |
| `/ce-plan` | Write an implementation plan to `docs/plans/YYYY-MM-DD-NNN-<type>-<slug>.md`. Existing plans in `docs/plans/` are the shape reference. |
| `/ce-doc-review` | Have a teammate read the plan doc, or run an adversarial-review prompt against it via the Task tool. Goal: surface contradictions, missing acceptance criteria, scope creep. |
| `/ce-frontend-design` | Sketch layout and data needs before coding. Keep the design aligned with the dense, scannable operational UI style in `## Frontend Expectations`. |
| `/ce-work` | Write the code. Follow tier rules: test-first for safety-critical, tests-alongside for standard, no required tests for routine. |
| `/ce-test-browser` | `pnpm dev` on `:3000`, click through affected routes in browser. |
| `/ce-code-review` | Open a draft PR and request teammate review, or run `code-reviewer` + `silent-failure-hunter` from the `pr-review-toolkit` plugin via Task tool. |
| `/ce-simplify-code` | Read the diff yourself for simplification, or run `code-simplifier` from `pr-review-toolkit` via Task tool. |
| `/ce-debug` | 4-phase: reproduce → isolate → root-cause → fix-with-test. Don't accept "try this" without a hypothesis. |
| `/ce-commit-push-pr` | `git add <files> && git commit -m "..." && git push -u origin <branch> && gh pr create --title ... --body ...`. See `## Branching, commits, and PRs` for the body structure. |
| `/ce-resolve-pr-feedback` | For each human and Copilot thread: read → fix or reply → resolve via GraphQL `resolveReviewThread` mutation (`gh api graphql -f query='mutation { resolveReviewThread(input:{threadId:"..."}) { thread { isResolved } } }'`). List open threads with `gh pr view <n> --json reviewThreads`. Do not merge until all are `isResolved: true`. |
| `/ce-compound` | Write a learnings doc to `docs/solutions/<category>/<slug>.md` with frontmatter (`module`, `tags`, `problem_type`). |
| `/ce-compound-refresh` | Edit the relevant `docs/solutions/` entry when paths, names, or tooling it references have changed. |

### Tier rules

| Tier | Examples in this repo | Process |
|---|---|---|
| **Routine** | Copy edits, lint fixes, config cleanup, package metadata, scaffold files mirroring an established pattern | `/ce-work` directly; `/ce-code-review` optional |
| **Standard** | Shared type additions, new API endpoints, UI shell work, package wiring, non-security utilities | `/ce-plan` → `/ce-work` → `/ce-code-review` → `/ce-commit-push-pr` |
| **Safety-critical** | `packages/db/src/schema/**`, `packages/db/src/rls.ts`, `packages/db/src/client.ts`, `packages/db/src/context.ts`, `packages/db/migrations/**`, `packages/auth/src/**`, `apps/api/src/middleware/**`, session handling, tenant resolution, recovery-code handling, privileged DB clients, import guards protecting tenant isolation | `/ce-brainstorm` → `/ce-plan` (every unit gets `Execution note: test-first`) → `/ce-work` → `/ce-code-review` → `/ce-commit-push-pr` → `/ce-compound` |

Why these surfaces are safety-critical: FelixOS is multi-tenant from the first row. A mistake in these paths can leak tenant data across RLS boundaries, bypass TOTP auth, corrupt the entity spine, or silently weaken the guarantees that all other agents and phases depend on. Real Postgres is required for RLS and isolation tests — no mocks for security claims. `/ce-code-review` at effort `max` is mandatory before merge.

### When to brainstorm

`/ce-brainstorm` fires when ANY of these are true:

- New user-facing screen, route, or flow (e.g., entity management UI, TOTP enrollment shell, admin views)
- New database table or destructive migration (anywhere in `packages/db/src/schema/` or `packages/db/migrations/`)
- Any safety-critical change — including any edit inside `packages/auth/src/` or `packages/db/src/`
- Cross-cutting work touching 4+ files non-trivially or spanning multiple subsystems (e.g., auth + db + api + web together)
- The user story can't be stated in one sentence

Skip brainstorm for: bug fixes, copy edits, dep bumps, single-file refactors, scaffold files that mirror an established pattern.

### When to test-first

`/ce-plan` writes `Execution note: test-first` on every safety-critical unit. `/ce-work` honors the note: failing test first, then implementation.

For Standard and Routine tiers, tests are written alongside or after implementation. Write tests when the behavior is non-obvious or when the plan contract specifies coverage.

Test layering:

- **Unit** (Vitest) — pure functions, utilities, type contracts in isolation
- **Integration** (Vitest) — API routes and DB operations hitting real Postgres 18 + pgvector (Docker Compose stack from U9); never accept 422/500 as passing
- **E2E** (Playwright — to be set up when multi-page auth flows land) — full user flows in browser; auth state via saved `storageState`

### Browser testing

Browser testing runs in this priority order — use the lowest tier that covers the change:

| Tier | Tool | When to use |
|---|---|---|
| **Primary (ad-hoc)** | `/ce-test-browser` | First-pass "did I obviously break something" check on routes affected by the current diff |
| **Scripted** | `playwright-cli` skill | Scripted interactions, form fills, multi-step navigation, screenshots beyond what `/ce-test-browser` drives |
| **Codified (CI)** | Playwright (`@playwright/test`) | Codified regression tests, auth-gated flows, multi-step journeys that should run in CI |

**Dev server:** `pnpm dev` starts the Next.js web app on `:3000` and the Fastify API on `:4000`. Do not start, stop, or restart the user's running dev server — treat it as a user-managed process. `/ce-test-browser` auto-detects whatever is serving on `localhost:3000`.

**Pre-merge gate:** before calling "tests pass" on any PR, classify the change in 60 seconds. If it touches a **multi-page flow** (login → shell → entity action) **or route-level chrome** (root layout, nav, auth-gated boundary, error/loading boundaries), Playwright E2E coverage is mandatory — not optional, not a follow-up issue. Unit + integration + ad-hoc `/ce-test-browser` does not substitute for this class of change.

### Compound learnings

Run `/ce-compound` after any non-trivial fix, decision, or pattern discovery. It writes to `docs/solutions/` (see `## Compound knowledge store` below).

Run `/ce-compound-refresh` when an existing entry goes stale: cited paths moved, tooling changed, or an entry references patterns that have been replaced repo-wide. Do not run broad sweeps mid-feature — refreshes should be intentional and scoped.

---

## Compound knowledge store

`docs/solutions/` — documented solutions to past problems: bugs, architecture patterns, tooling decisions, conventions, institutional knowledge. Organized into category subdirectories with YAML frontmatter (`module`, `tags`, `problem_type`). Suggested categories:

- `architecture-patterns/` — module resolution, monorepo wiring, ALS patterns
- `auth/` — TOTP flow, recovery codes, session handling
- `db/` — RLS policies, client scoping, migration process
- `testing/` — Postgres test setup, isolation test patterns
- `conventions/` — ESLint config, commit discipline, PR process

**Adjacent knowledge stores — search these before re-solving:**

- `docs/plans/` — architecture approach and Foundation phase plans; authoritative source of truth for scope and contracts
- `README.md` — repo overview and quick-start

---

## Issue tracking

All work on this repo is tracked as **GitHub Issues** on `txmyer-dev/felixos`. Issues are referenced by their repo-scoped number — `#N` (e.g. `#42`) — with no team prefix.

FelixOS is a monorepo (multiple apps and packages). Use a **GitHub Projects v2 board** on `txmyer-dev/felixos` so issues across packages stay organized. The board carries the In Progress / In Review / Done lifecycle via its **Status** single-select field.

Drive issues and the board with the `gh` CLI: `gh issue create|edit|close|view`, and `gh project item-add|item-edit|field-list` for board moves. Moving a board item's Status from the CLI requires the project scope — run `gh auth refresh -s project` once.

### One issue per unit of work

Every PR maps to ≥1 issue. Exceptions only for trivial chores (dep bumps, lockfile updates) where the commit message itself documents the change.

For multi-PR work (e.g., a Foundation unit that touches both the DB schema and the API layer), create a parent issue and one **GitHub sub-issue** per PR. The parent stays open until you close it by hand — closing all sub-issues does not auto-close the parent.

### Issue lifecycle

| When | Status | Mechanism |
|---|---|---|
| Filed, not yet scheduled | Backlog | Manual |
| Scheduled / ready to pick up | Todo | Manual |
| Branch created (work starts) | In Progress | Manual |
| PR opened (review starts) | In Review | Manual |
| PR merged | Done | Auto — `Closes #N` closes the issue; board's built-in automation moves it |
| Won't do / abandoned | Cancelled | Manual — close as **"not planned"**, then set Status = Cancelled |
| Superseded by another issue | Duplicate | Manual — **"Close as duplicate"**, then set Status = Duplicate |

The built-in "issue closed → Done" automation fires on every close — so closing as *not planned* or *duplicate* moves the board item to Done unless you set Status manually afterward.

After merge, verify the close landed: `gh issue view #N`. A mistyped keyword or non-default base branch breaks the chain silently.

Apply a **`blocked`** label (plus a comment naming the blocker) to any issue waiting on an external dependency — it coexists with whatever Status the issue is in.

### Labels

| Group | Labels |
|---|---|
| **Tier** | `tier:routine`, `tier:standard`, `tier:safety-critical` |
| **Area** | `area:workspace`, `area:shared-types`, `area:db`, `area:auth`, `area:api`, `area:web`, `area:cli` |
| **Type** | `type:bug`, `type:feature`, `type:improvement`, `type:docs` |
| **Flags** | `blocked`, `needs-info`, `priority:high`, `priority:low`, `good first issue` |

---

## Branching, commits, and PRs

### Branch naming

`<type>/<issue-number>-<short-slug>` — e.g. `feat/4-rls-scoped-client`

- `<type>` ∈ `feat` | `fix` | `chore` | `docs` | `refactor` | `test`
- `<issue-number>` is the bare GitHub issue number — no `#`, no prefix
- `<short-slug>` is 2–5 hyphenated words from the issue title

Create branches with `git checkout -b <branch-name>`. Do not use `/ce-worktree` — this repo uses traditional in-place feature branches.

Examples: `feat/1-monorepo-scaffold`, `feat/4-rls-scoped-client`, `fix/5-totp-replay-guard`

### Commit messages (conventional commits)

Format: `<type>(<scope>): <imperative subject>`

- `<type>` matches the branch type
- `scope` is the affected subsystem — common scopes: `workspace`, `shared-types`, `db`, `auth`, `api`, `web`, `cli`, `ci`, `docs`
- Subject is imperative, lowercase, no period, ≤72 chars
- Body: active voice, 2–3 sentences naming what changed and why
- `Refs #N` for mid-branch commits; `Closes #N` only on the commit (or PR body) that genuinely finishes the issue

`/ce-commit` and `/ce-commit-push-pr` follow this convention and append the standard `Co-Authored-By: Claude ...` attribution.

```
feat(auth): implement TOTP device-enrollment endpoint

Adds POST /auth/enroll behind the ALS tenant guard and seeds a test
fixture covering the happy path and expired-code rejection.

Refs #5
```

```
fix(db): clear ALS context on connection release

The ALS context was not being reset between requests on keep-alive
connections, allowing subsequent requests to read the prior tenant's ID.

Closes #12
```

### PR title

`<type>(<scope>): <descriptive subject>` — same shape as a commit subject. Keep the issue number **out** of the title; it lives in the PR body as `Closes #N`.

Examples:
- `feat(api): add entity CRUD endpoints with tenant scoping`
- `fix(db): clear ALS context on connection release`
- `feat(web): implement TOTP login shell`

### PR body (required fields)

- **`Closes #N`** as a top-level line — links the PR and auto-closes the issue on merge to the default branch. Use `Refs #N` for partial work that should link without closing.
- **Plan reference** — link to the relevant `docs/plans/` or `docs/solutions/` doc
- **Summary of changes** — what changed and why
- **Test plan** — bulleted checklist: Vitest unit/integration commands run, Playwright E2E runs if applicable, manual browser checks for UI changes
- **Schema migrations** — if the PR adds a Drizzle migration file, note the filename and confirm the migration was applied; never run `pnpm db:migrate` or `pnpm db:push` without explicit instruction
- **Out-of-scope callouts** — anything explicitly deferred, with `#M` reference

For UI-visible changes, include screenshots or a short demo note.

### Push and merge

- First push: `git push -u origin <branch>`; subsequent: `git push`
- Never force-push to `main`. Force-push to feature branches is acceptable when rebasing pre-review; after first reviewer comment, use additive commits instead.
- **Merge commit by default** — preserves per-branch history on `main` so the development journey stays inspectable. Exception: trivial single-commit PRs (dep bumps, copy-edit fixes) may use squash.
- Because every branch commit lands on `main`, conventional commit rules are mandatory — reword sloppy WIP commits via interactive rebase before opening the PR.
- **Resolve all automated reviewer threads before merging.** GitHub Copilot fires on every PR. Treat Copilot threads at the same weight as human review: read → fix or reply → resolve via `resolveReviewThread` mutation → confirm `isResolved: true`. Do not merge with any thread open.

### After merge

- Delete the feature branch (GitHub auto-delete setting; locally `git branch -d <branch>`)
- `/ce-clean-gone-branches` prunes locals whose remotes are gone
- If the work was non-trivial, run `/ce-compound` before context fades

---

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

Use Vitest for unit and integration tests.

- Pure utilities: unit tests.
- API behavior: request-level integration tests.
- DB schema, RLS, and isolation: tests against real Postgres 18 + pgvector (Docker Compose stack, U9).
- Web login and authenticated shell: browser-level verification via `/ce-test-browser` or Playwright.
- Multi-page auth or route-boundary work: Playwright E2E coverage is mandatory, not optional.

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

## Stop Conditions

Stop and ask before:

- Changing frozen shared contracts after dependent work begins.
- Weakening tenant isolation, auth, recovery, or privileged-client boundaries.
- Deleting data, files, migrations, or user-owned changes.
- Publishing, deploying, sending external messages, or changing credentials.
- Introducing a new service, datastore, framework, or major dependency not in the plan.

When in doubt, preserve the plan contract and surface the tradeoff.
