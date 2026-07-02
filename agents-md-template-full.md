<!--
  AGENTS.md template for compound-engineering-plugin projects.
  (Production-Grade Claude Code workshop — the FULL take-home, with [BRACKET] swap-zones.
   For the quick drop-in used in the Day 1 hands-on, see agents-md-template-example.md.
   Bring THIS version to your real work repo and fill the brackets.)

  Calibrated against compound-engineering plugin version 3.11.1 (2026-06-05). When porting
  to a new repo, also note in the doc body which plugin version you wrote it against,
  so future-you knows whether the documented behavior still matches the skills.

  HOW TO USE:
    1. Copy this file to your new project as `AGENTS.md` (alongside CLAUDE.md).
    2. Fill in every [BRACKET] block — those are project-specific.
    3. Delete or replace the framework block at the very top per your stack.
    4. Trim any sections that don't apply (e.g., delete browser testing if no UI).

  DURABLE vs SWAP map (which sections to leave alone vs change):
    Durable (leave alone):    Development process diagram skeleton, "Without the
                              compound-engineering plugin" manual-fallback table,
                              Tier rules concept, When to brainstorm, When to
                              test-first, Compound learnings, docs/solutions/ pattern,
                              branching/commits/PRs conventions, GitHub Issues/Projects
                              tracking model (issue refs #N, Closes-#N auto-close on
                              merge, Projects-v2-board lifecycle with built-in Done
                              automation + manual In Progress / In Review).
    Swap zones (13 total):    Framework warning block, branching strategy callout,
                              dev-server command + port, safety-critical paths,
                              "why safety-critical" paragraph, effort-level
                              cross-ref, test framework + DB target, browser
                              tooling, GitHub repo identity (owner/repo) + optional
                              Projects board (monorepos only), label set, plan-doc
                              paths, examples, common scopes, adjacent knowledge
                              stores, frontend-design source, conditional reflective
                              skills (Slack / Proof / image-gen).

  NOTE: This template hard-codes GitHub Issues/Projects as the tracker (it is no
  longer a swap zone). Issues are referenced as #N (repo-scoped, no team prefix).
  Single-project repos use plain GitHub Issues (open/closed + labels) — no Projects
  board needed. Monorepos (e.g. a multi-app/-package repo) SHOULD use a GitHub
  Projects v2 board so issues across packages stay organized; that board carries the
  In Progress / In Review / Done lifecycle. If you ever port this to a non-GitHub
  tracker, the Issue tracking + Branching/commits/PRs sections need a manual rewrite.
-->

[FRAMEWORK_WARNING_BLOCK]
<!--
  Replace [FRAMEWORK_WARNING_BLOCK] with one of:

  (A) Next.js project — let next-devtools MCP manage this:
      <!-- BEGIN:nextjs-agent-rules -->
      # This is NOT the Next.js you know
      This version has breaking changes — APIs, conventions, and file structure may
      differ from your training data. Read the relevant guide in
      `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
      <!-- END:nextjs-agent-rules -->

  (B) Other framework — write your own:
      # This is [FRAMEWORK NAME] [VERSION]
      [Two-line warning naming the version-specific traps that bit your training data]

  (C) Framework-agnostic project — delete this block entirely.
-->

## Development process

This repo uses the **compound-engineering** plugin (`/ce-*` skills) as the spine of every change, with **GitHub Issues** for issue tracking (organized on a GitHub Projects v2 board in monorepos; plain Issues are enough in single-project repos). Default end-to-end pipeline:

```
[GitHub Issue #N created]
  → /ce-brainstorm → /ce-plan
  → [/ce-doc-review on the plan doc — conditional, run for safety-critical or multi-unit plans]
  → [BRANCH_CREATION_STEP] → (Projects board: move #N to In Progress)
  → [/ce-frontend-design — conditional, run for any UI-visible work before /ce-work]
  → /ce-work (commits reference #N)
  → [/ce-debug if bugs surface — conditional, loop until green]
  → /ce-simplify-code (clean up before review)
  → /ce-test-browser
  → /ce-code-review
  → [/ce-demo-reel — conditional, run for any UI-visible PR; output goes in PR body]
  → /ce-commit-push-pr (PR body includes "Closes #N" as the closing link) → (Projects board: move #N to In Review)
  → /ce-resolve-pr-feedback — MANDATORY, covers human AND Copilot/automated reviewers: after the PR opens, wait for Copilot's review to land, then read + fix-or-reply + resolve EVERY Copilot thread here. Resolving Copilot threads is part of this step, not a separate later gate — the commit→push→PR cycle is not complete until they are all resolved
  → [merge PR — only after every Copilot/automated-reviewer thread is resolved] → #N auto-closes on merge (Projects board auto-moves it to Done)
  → /ce-compound (writes to docs/solutions/)
```

<!--
  The "(Projects board: ...)" steps apply only to repos that use a GitHub Projects v2
  board (recommended for monorepos). Single-project repos that track work with plain
  GitHub Issues skip these moves — the issue's open→closed state IS the lifecycle, and
  "Closes #N" on merge closes it. See `## Issue tracking` for the full model.
-->


<!--
  [BRANCH_CREATION_STEP] is one of:
    (A) Worktrees:    "/ce-worktree (branch: <type>/<issue-number>-<slug>)"
    (B) Traditional:  "git checkout -b <type>/<issue-number>-<slug>"

  Pick whichever this repo actually uses. The choice has downstream implications
  (the Issue lifecycle table and the Branch naming section both reference it).
-->

Not every step fires every time — the tier rules below decide what runs. See `## Issue tracking` and `## Branching, commits, and PRs` below for the bookend mechanics.

**One PR in flight at a time — merge before you move on.** Don't pile up a stack of open PRs. Take each unit all the way through the pipeline above (brainstorm → … → merge → compound) and *merge it* — every human + Copilot/automated-reviewer thread resolved — before starting the next branch. Parallel branches/worktrees are for isolation, not for hoarding un-merged work: finish → review → merge → *then* begin the next unit. This keeps the merge queue clean, avoids cross-PR conflicts on shared files (this doc, lockfiles, schema), and keeps each change reviewable on its own.

**Reflective skills (off-pipeline, fire occasionally — not per change):**

- `/ce-strategy` — create or update a `STRATEGY.md` at the repo root naming the target problem, approach, users, key metrics, and tracks of work. Run when starting a new product, shifting direction, or when nothing is happening for ambiguous reasons.
- `/ce-product-pulse` — generate a time-windowed pulse report on what users experienced and how the product performed (usage, quality, errors, signals worth investigating). Run weekly/monthly, or when "we should look at how things are going" lands.
- `/ce-ideate` — generate and critically evaluate grounded ideas about a topic. Run when exploring "what should we improve / try next" before committing to a brainstorm — produces several options with trade-offs rather than refining a single idea.
- `/ce-optimize` — metric-driven iterative optimization loops. Define a measurable goal, build measurement scaffolding, then run parallel experiments that try many approaches, measure each, and converge. Run when an existing surface (clustering quality, search relevance, build perf, prompt quality) has a measurable target you need to drive.
- `/ce-sessions` — Q&A over your Claude Code / Codex / Cursor session history. Run when returning to old work, investigating "what did I try before?", or surfacing context from past investigations the current session can't see.

[CONDITIONAL_REFLECTIVE_SKILLS — keep only the bullets that apply to this repo; delete the whole subsection if none do. Default content lists the three project-conditional skills:]

**Conditional reflective skills (uncomment per repo):**

- `/ce-slack-research` — search Slack for organizational context (decisions, constraints, discussion arcs not captured elsewhere). Useful when the team uses Slack as a knowledge source. Delete if your team doesn't.
- `/ce-proof` — collaborative markdown review via [Proof](https://proofeditor.ai) (human-in-the-loop loops over plan docs, strategy, pulse reports). Useful when reviewers include non-developer stakeholders. Delete if reviews happen entirely in GitHub / docs.
- `/ce-gemini-imagegen` — generate or edit images via the Gemini API (Nano Banana Pro). Useful for content, marketing, or design-adjacent repos. Delete for backend / CLI repos that don't ship visual assets.

> **Plugin version:** calibrated against `compound-engineering` v[X.Y.Z] ([YYYY-MM]). If sub-skill behavior diverges from this doc, the plugin wins — re-read the relevant skill at `~/.claude/plugins/cache/compound-engineering-plugin/compound-engineering/<ver>/skills/<skill>/SKILL.md` and update this doc.

> **Branching:** [BRANCHING_STRATEGY_CALLOUT]
<!--
  [BRANCHING_STRATEGY_CALLOUT] is one of:
    (A) Worktrees:    "this repo uses git worktrees via `/ce-worktree`, which keeps
                      the main checkout untouched while feature work happens in a
                      sibling directory. If you don't have the plugin, the manual
                      fallback (`git checkout -b`) is below."
    (B) Traditional:  "this repo uses traditional feature branches (`git checkout -b`),
                      not git worktrees. Do not invoke `/ce-worktree`."
-->

### Without the compound-engineering plugin

The `/ce-*` slash commands above belong to the [compound-engineering plugin](https://github.com/everyinc/compound-engineering-plugin) — recommended for everyone working on this repo, but **not required**. The plugin codifies the pipeline; the *process itself* is achievable with plain git, a code editor, and the GitHub CLI (`gh`) (the GitHub MCP is an optional alternative).

**To install the plugin** (once per machine):

1. Open Claude Code and run `/plugin marketplace add EveryInc/compound-engineering-plugin` — this adds the plugin's marketplace (required first; a plain `/plugin` search won't find it otherwise).
2. Run `/plugin install compound-engineering` to install it.
3. Run `/ce-setup` from the repo root to auto-check tools (`gh`, `jq`, `vhs`, `silicon`, `ffmpeg`, `ast-grep`, `agent-browser`) and bootstrap `.compound-engineering/config.local.yaml`.
4. After install, every `/ce-*` reference in this doc is a single command.

**If you don't have the plugin**, here's the manual fallback for each step in the pipeline:

| Plugin command | Manual equivalent |
|---|---|
| `/ce-brainstorm` | Discuss in Slack / a GitHub issue comment / a design doc before writing code. The goal is alignment on user-visible behavior + scope before the first commit. |
| `/ce-plan` | Write an implementation plan to `[PLAN_DOC_PATH_EXAMPLE — e.g., docs/plans/<YYYY-MM-DD>-<issue-number>-<slug>.md]`. Existing plans (e.g., `[EXAMPLE_PLAN_PATH]`) are a good shape reference. |
| `/ce-doc-review` | CE-native skill. Without it: have a teammate read your plan doc, or write a quick adversarial-review prompt and run it against the doc via the Task tool. Goal: surface contradictions, missing acceptance criteria, scope creep, role-specific gaps. |
| `/ce-worktree` | `git checkout -b <type>/<issue-number>-<slug>` — traditional in-place feature branch. The worktree benefit (isolating from current checkout) is lost; otherwise equivalent. [Delete this row if the repo uses traditional branches and `/ce-worktree` is not part of the workflow.] |
| `/ce-frontend-design` | CE-native skill. Without it: sketch in Figma / Excalidraw before building. [If a design source-of-truth exists, mention it: e.g., "The Figma export at `docs/design/` is the source-of-truth — start there."] The separate `frontend-design` plugin offers a `frontend-design:frontend-design` skill as another alternative if installed. Goal: visual fidelity decisions land before coding, not as a post-hoc revision. |
| `/ce-work` | Just write the code. Follow tier rules: tests-first for safety-critical, tests-alongside for standard, no required tests for routine fixes. |
| `/ce-test-browser` | Open the dev server (`[DEV_SERVER_COMMAND]` on `:[DEV_PORT]`) in your browser and click through the affected routes. |
| `/ce-code-review` | CE-native skill (parallel reviewer personas + merge/dedup pipeline). Without it: open a draft PR and request review from a teammate, or — if the `pr-review-toolkit` plugin is installed — run its `code-reviewer` and `silent-failure-hunter` agents via the Task tool. |
| `/ce-simplify-code` | CE-native skill. Without it: read the diff yourself with simplification in mind, or — if the `pr-review-toolkit` plugin is installed — run its `code-simplifier` agent via the Task tool. |
| `/ce-debug` | CE-native skill. Without it: follow the 4-phase manual process — reproduce → isolate → root-cause → fix-with-test. Don't accept "try this" without a hypothesis. The separate `superpowers` plugin offers `superpowers:systematic-debugging` as another alternative implementation if installed. |
| `/ce-demo-reel` | Record a screencap with macOS `Cmd+Shift+5` (full app or window), or `vhs` for terminal output. Drop the GIF/MP4 in the PR body so reviewers see the change without checking it out. |
| `/ce-commit-push-pr` | `git add -A && git commit -m "..." && git push -u origin <branch> && gh pr create --title ... --body ...`. The "Conventional commits" section below has the message format. PR body writing is built in (see `## Branching, commits, and PRs` → PR body for the structure it follows). |
| `/ce-resolve-pr-feedback` | Reply to human PR comments AND resolve every Copilot/automated-reviewer thread (read each, fix or reply, then resolve via the GraphQL `resolveReviewThread` mutation); push fixes as additional commits. The commit→push→PR cycle is not done until all Copilot threads are resolved — never merge with any thread still open. |
| `/ce-compound` | After non-trivial work, write a learnings doc to `docs/solutions/<category>/<slug>.md` with frontmatter (`module`, `tags`, `problem_type`). If the repo keeps an optional `CONCEPTS.md` glossary (see Compound knowledge store below), also add or refine any domain terms the work surfaced. |
| `/ce-compound-refresh` | Edit the relevant `docs/solutions/` entry in place when the underlying code/tooling changes. |
| `/ce-strategy` | Maintain a `STRATEGY.md` at the repo root by hand — target problem, approach, users, key metrics, current tracks of work. Update when direction shifts. |
| `/ce-product-pulse` | Run analytics queries by hand (PostHog, GA, Stripe, error tracker) and write the digest to `docs/pulse/<YYYY-MM-DD>.md`. |
| `/ce-ideate` | Brainstorm in a doc — list candidate ideas, then critically evaluate each against constraints. Divergent generation followed by convergent evaluation; goal is options-with-tradeoffs, not a single refined direction. |
| `/ce-optimize` | Define the target metric, build measurement scaffolding (dashboard, A/B harness, eval set), then iterate experiments by hand and track results in a doc. The CE skill systematizes this — manually it's an experiment log + a clear win/loss criterion. |
| `/ce-sessions` | Search past sessions by hand — `grep -rl <keyword> ~/.claude/projects/` (Claude Code), or the equivalent transcript dirs for Codex / Cursor. Read matched files for context. The CE skill builds an index and answers questions over it. |
| `/ce-slack-research` | Use Slack search by hand with relevant queries. Note the channel + thread links in your plan-doc context section so the audit trail survives. [Delete this row if the repo doesn't use Slack.] |
| `/ce-proof` | Share the doc as a Google Doc / GitHub PR with comment threads enabled. Iterate based on resolved comments. The CE skill wraps this in a structured review loop. [Delete this row if the team doesn't use Proof.] |
| `/ce-gemini-imagegen` | Generate images by hand via the Gemini web UI / API, or use any other image-generation tool. Save outputs to `[ASSETS_DIR — e.g., public/images/, docs/assets/]`. [Delete this row if the project doesn't ship visual assets.] |
| `/ce-clean-gone-branches` | `git fetch -p && git branch -vv \| awk '/: gone]/ {print $1}' \| xargs -r git branch -d`. |

The GitHub Issues bookends (issue lifecycle, status transitions) and the Conventional Commits / branch-naming / PR-body rules apply equally with or without the plugin — those are repo conventions, not plugin features.

### Tier rules (blast-radius)

| Tier | Examples in this repo | Process |
|---|---|---|
| **Routine** | UI tweaks, copy edits, lint fixes, dep bumps, scaffolding inside an existing pattern | `/ce-work` directly with a bare prompt; `/ce-code-review` optional |
| **Standard** | New components, new routes fitting existing patterns, schema additions on non-critical tables, new API endpoints | `/ce-plan` → `/ce-work` → `/ce-code-review` → `/ce-commit-push-pr` |
| **Safety-critical** | [SAFETY_CRITICAL_PATHS — list this repo's blast-radius hot spots: auth code, payment handlers, destructive migrations on user/billing tables, public API contracts, anything that loses data when wrong. Be specific with paths, not vague labels.] | `/ce-brainstorm` → `/ce-plan` (every unit gets `Execution note: test-first`) → `/ce-work` → `/ce-code-review` → `/ce-commit-push-pr` → `/ce-compound` |

Why these surfaces are safety-critical: [WHY_SAFETY_CRITICAL_PARAGRAPH — 2-3 sentences naming the *consequences* of getting these wrong: gates access (auth), transacts money (payments), corrupts source-of-truth data, breaks public contracts. Make it concrete enough that a future agent reading this knows whether their change touches one of these surfaces or not.]

Safety-critical effort level is `max`[EFFORT_DEFAULT_CROSSREF — e.g., " (set in `CLAUDE.md` → `## Effort level defaults`)" if you maintain that section in CLAUDE.md, otherwise delete this clause]. `/ce-code-review` is mandatory before merge for this tier.

### When to brainstorm

`/ce-brainstorm` fires when ANY of these are true:

- New user-facing screen, route, or flow [(name 1-2 examples specific to this repo, e.g., "(parent dashboard, kid mode, onboarding)")]
- New database table or destructive migration (anywhere in `[SCHEMA_DIR — e.g., src/db/schema/, db/schema/]`)
- Any safety-critical change (per tier above) — including any edit inside `[SAFETY_DIR_EXAMPLE_1]` or `[SAFETY_DIR_EXAMPLE_2]`
- Cross-cutting work touching 4+ files non-trivially or spanning multiple subsystems [(name 1 example, e.g., "(e.g., signup + pipeline + admin)")]
- The user story can't be stated in one sentence

Skip brainstorm for: bug fixes, copy edits, dep bumps, single-file refactors, scaffolding that mirrors an existing component.

### When to test-first

`/ce-plan` writes `Execution note: test-first` on every unit in the safety-critical tier. `/ce-work` honors the note: failing test first, then implementation, in separate steps.

For Standard and Routine tiers, `/ce-work` runs Test Discovery + Test Scenario Completeness + System-Wide Test Check on every unit (built-in to the skill). Test-first is optional — write tests in the same unit when it makes sense.

Test layering:

- **Unit** ([UNIT_TEST_FRAMEWORK — e.g., Vitest, Jest, RSpec]) — pure functions, utilities, components in isolation
- **Integration** ([INTEGRATION_TEST_FRAMEWORK — usually same as unit]) — API routes hitting [DB_TEST_TARGET — e.g., a real Supabase test database, a Neon test branch, a sqlite tmp DB]; never accept 422/500 as passing
- **E2E** ([E2E_FRAMEWORK — e.g., Playwright, Cypress]) — full user flows in browser; auth state via [AUTH_FIXTURE_PATH — e.g., `auth.setup.ts` + saved `storageState`] [Delete this row if the project has no UI.]

### Browser testing

[BROWSER_TESTING_BLOCK — delete this entire section if the project has no UI. Default content for a UI project:]

Browser testing runs in this priority order — use the lowest tier that covers the change:

| Tier | Tool | When to use | Where it lives |
|---|---|---|---|
| **Primary (ad-hoc)** | **`/ce-test-browser`** (uses `agent-browser` CLI) | The first-pass "did I obviously break something" check on routes affected by the current PR or branch diff, during a `/ce-work` cycle | Install once via Homebrew. Auto-detects the running dev server. |
| **Scripted** | **`playwright-cli` skill** | Scripted browser interactions, form fills, multi-step navigation, screenshots, and data extraction that go beyond what `/ce-test-browser` drives | The `playwright-cli` skill (Playwright-driven) |
| **Codified (CI)** | **[E2E_FRAMEWORK — e.g., Playwright]** (`[E2E_PACKAGE — e.g., @playwright/test]`) | Codified regression tests, auth-gated flows, multi-step user journeys, anything that should run in CI | `[E2E_TEST_DIR — e.g., tests/e2e/*.spec.ts]` with `[E2E_CONFIG — e.g., playwright.config.ts]` at repo root |

Reach for the lowest tier first: `/ce-test-browser` for the quick pass, the `playwright-cli` skill when you need scripted control, and codified [E2E_FRAMEWORK] specs when a flow is worth locking into CI.

**Dev server:** [DEV_SERVER_DESCRIPTION — e.g., "runs on port `3000` (Next.js default) via `bun dev`" or "the user runs `pnpm dev` on port `4444`. Do not start, stop, or restart it — it's the user's process."]. `/ce-test-browser` auto-detects whatever's serving on `localhost:[DEV_PORT]`. For scripted browser work use the `playwright-cli` skill — do not substitute Chrome MCP or other browser-control tools (`/ce-test-browser` will not recognize them).

**Pre-merge gate: 60-second up-front [E2E_FRAMEWORK] classification.** Before declaring "tests pass" on any PR, spend 60 seconds at the *start* of the work classifying the change. If it touches a **user-facing multi-page flow** (signup → onboarding → first action, checkout, multi-step wizard) **OR route-level chrome** (root layout, nav, header/footer, auth-gated boundary, error/loading boundaries), [E2E_FRAMEWORK] coverage is **mandatory** — not optional, not "follow-up issue." Unit + integration + ad-hoc `/ce-test-browser` does not substitute for this class of change, because the regressions that ship without [E2E_FRAMEWORK] coverage are exactly the ones unit-level tests can't see (cross-page state, redirect chains, layout-level regressions, auth-boundary leaks). Doing the classification up-front prevents the much worse failure mode: writing the feature, calling tests green, then discovering at review time that the only verification was "I clicked through it once locally."

### Compound learnings

Run `/ce-compound` after any non-trivial fix, decision, or pattern discovery. It writes to `docs/solutions/` (see `## Compound knowledge store` below).

`/ce-compound-refresh` runs when existing entries go stale or get superseded. Trigger it when:

- A new learning **contradicts or supersedes** an older entry in the same area [(give one repo-specific example, e.g., "a classifier prompt change made the older 'classifier confidence threshold' note misleading")].
- Cited file paths, function names, or env var names **moved or were renamed** [(one example)].
- Tooling, framework, or service references **changed** (major version bumps, framework behavior shifts, MCP server URL changes, library migrations).
- An entry references **deprecated patterns** that have been replaced repo-wide [(give one example, e.g., "`pnpm` → `bun`, sync `cookies()` → async")].
- Periodic **monthly sweep** when reviewing `docs/solutions/` — quick scan for entries older than 60 days, prune or refresh anything that no longer reflects the codebase.

Do not run broad sweeps mid-feature or for every routine commit — refreshes should be intentional, scoped to entries you've already identified as stale.

## Compound knowledge store

`docs/solutions/` — documented solutions to past problems (bugs, architecture patterns, design patterns, tooling decisions, conventions, workflow practices, institutional knowledge). Organized into category subdirectories (e.g., `performance-issues/`, `architecture-patterns/`, `conventions/`) with YAML frontmatter (`module`, `tags`, `problem_type`).

**Optional — `CONCEPTS.md` (repo-root domain glossary).** If this repo adopts it, a `CONCEPTS.md` at the root defines the project-specific terms that mean something precise here (entities, named processes, status concepts) — one-sentence definitions that `docs/solutions/`, `AGENTS.md`, and `CLAUDE.md` can cite without redefining. `/ce-compound` accretes to it automatically as a side effect of documenting a learning **if the file already exists**, and seeds the core nouns of the area it touched; a repo-wide first draft is a `/ce-compound-refresh` bootstrap, not something `/ce-compound` produces on its own. Entries must stand alone (no file paths, class names, status fields, or drift-prone numbers — state the behavior, not the value). Skip this entirely if the repo hasn't adopted the glossary — nothing requires it. [Delete this paragraph if you don't plan to keep a `CONCEPTS.md`.]

Adjacent existing knowledge stores in this repo (search these too before re-solving):

[ADJACENT_KNOWLEDGE_STORES — list any other doc directories that carry searchable institutional knowledge. Common entries: `docs/plans/` (implementation plans), `docs/series/` (episode plans for content projects), `docs/architecture/` (system docs), `docs/runbooks/` (ops procedures), per-module READMEs like `lib/safety/README.md`. Format each as: `- `path` — one-line description of what's there`. Drop this whole subsection if nothing else exists yet.]

Relevant when implementing or debugging in documented areas — search before re-solving.

## Issue tracking

All work on this repo is tracked as **GitHub Issues** on `[GH_OWNER]/[GH_REPO]`. Issues are referenced by their repo-scoped number — `#N` (e.g. `#42`) — with no team prefix. Cross-repo references use `[GH_OWNER]/<repo>#N`.

**Do you need a GitHub Projects board?**

- **Single-project repo** (one app/package): **no** — plain GitHub Issues (open/closed + labels) are enough. The issue's open→closed state *is* the lifecycle; `Closes #N` in a merged PR closes it. Skip the board, the Status field, and the "(Projects board: …)" steps in the pipeline above.
- **Monorepo / multi-surface repo** (several apps or packages under one repo): **yes** — use a **GitHub Projects v2 board** so issues across packages stay organized in one place. The board is `[GH_PROJECT_NAME]` (project #`[GH_PROJECT_NUMBER]`, `[GH_PROJECT_URL]`) and carries the In Progress / In Review / Done lifecycle via its **Status** single-select field. [Delete the `[GH_PROJECT_*]` placeholders + this bullet if this repo is single-project.]

Drive issues and the board with the **`gh` CLI**: `gh issue create|edit|close|view`, and `gh project item-add|item-edit|field-list` for board moves. (The GitHub MCP is an optional alternative; its Projects v2 field-update support is newer and less battle-tested than `gh`.) Moving a board item's Status from the CLI needs the project scope on the CLI's own token — run `gh auth refresh -s project` once (fine-grained PATs instead grant the org-level "Projects" read/write permission; there is no `project` *scope string* for fine-grained PATs). [Delete this board-tooling note if this repo is single-project.]

### One issue per unit of work

Every PR maps to ≥1 issue. Exceptions allowed only for trivial chores (dep bumps, lockfile updates) where the commit message itself documents the change.

For multi-PR work (e.g., [MULTI_PR_EXAMPLE — e.g., "a feature that touches both the signup wizard and a pipeline schema migration", or "Foundation + Live-Build for an episode"]), create a parent issue and one **GitHub sub-issue** per PR (Issues UI → "Create sub-issue", or `gh api` against the `/repos/{owner}/{repo}/issues/{n}/sub_issues` REST endpoint — the sub-issue must already exist). The parent shows a sub-issue progress bar and stays open until you close it: closing all sub-issues does **not** auto-close the parent, so close it by hand once the last child merges. [Optionally cite a recent example: "(Recent example: #N parent shipped via PRs #M1 / #M2 with sub-issues …)"]

### Issue lifecycle

This repo uses a Linear-style **Status** set on the Projects board (a single-select field). A new GitHub board ships with only `Todo` / `In Progress` / `Done`; add the rest as custom options (a Status field allows up to 50):

- **Backlog** — captured, not yet scheduled
- **Todo** — scheduled, not started
- **In Progress** — actively being worked
- **In Review** — PR open, under review
- **Done** — merged / closed as completed
- **Cancelled** — won't do (issue closed as *not planned*)
- **Duplicate** — superseded by another issue (closed as a duplicate)

GitHub automates the **Done** end; everything else is a manual move. Update the issue (and, on board repos, its Status) at each transition:

| When | Status | Mechanism |
|---|---|---|
| Filed, not yet scheduled | Backlog | **manual** (the optional "item added to project" board workflow can seed a default) |
| Scheduled / ready to pick up | Todo | **manual** |
| [BRANCH_CREATION_TRIGGER — e.g., "`/ce-worktree` creates the branch (work starts)" or "Branch created (work starts)"] | In Progress | **manual** — GitHub has no native "work started" trigger |
| PR opened (review starts) | In Review | **manual** — no native trigger (an optional custom GitHub Action can automate it; not included here) |
| PR merged (work shipped) | Done | **auto** — `Closes #N` closes the issue as completed, and the board's built-in *"issue closed → Done"* + *"PR merged → Done"* workflows (both on by default) move the item |
| Won't do / abandoned | Cancelled | **manual** — close the issue as **"not planned"**, then set Status = Cancelled |
| Superseded by another issue | Duplicate | **manual** — **"Close as duplicate"** (links the canonical issue), then set Status = Duplicate |

Orthogonal flag: apply a **`blocked`** label (plus a comment naming the blocker) to any open issue waiting on an external dependency — it coexists with whatever Status the issue is in, rather than replacing it.

**Cancelled / Duplicate wrinkle:** the built-in *"issue closed → Done"* automation fires on **every** close regardless of reason — so closing an issue as *not planned* or *duplicate* will move the board item to **Done** unless you set the Status manually afterward. The issue's own close-reason (completed / not planned / duplicate) is the durable record; the board Status is a projection you adjust for the Cancelled / Duplicate cases.

`Closes #N` (or `Fixes #N` / `Resolves #N`) in the **PR body** is required — it links the PR to the issue **and auto-closes the issue when the PR merges**. This is the opposite of an external tracker like Linear, where the keyword is audit-only; on GitHub the keyword actually closes the issue. Three preconditions for the auto-close → Done chain to fire: (1) the PR targets the repo's **default branch** (keywords on PRs into any other branch are silently ignored — no link, no close); (2) for the board move, the issue is **already on the board**; (3) repo Settings → Issues hasn't disabled auto-close. Closing keywords are parsed only in the PR **body** and in **commit messages** — never in the PR **title**.

After merge, whoever runs `/ce-commit-push-pr` should **verify** the close landed (`gh issue view #N` shows it closed; board repos confirm the item moved to Done) rather than assume it — a mistyped keyword or a non-default base branch breaks the chain silently. Single-project repos with no board carry Done / Cancelled / Duplicate via the issue's **close-reason** alone (open-state positions are optional labels). Only the open-state moves (Backlog → Todo → In Progress → In Review) and the Cancelled / Duplicate closes ever need explicit manual action — Done is automatic.

### Labels (recommended starter set)

Create as needed. Labels drive filtering and dashboards; they're not enforced.

| Group | Labels | Drives |
|---|---|---|
| **Tier** | `tier:routine`, `tier:standard`, `tier:safety-critical` | Dev process (see `## Development process` → tier rules) |
| [PROJECT_LABEL_GROUPS — replace with your project's domain-specific label groups. Examples: `area:*` per module, `phase:*` per launch milestone, `episode:*` for series content, `release:*` per shipped version, etc. Drop any group that doesn't apply.] | | |
| **Status** (plain-Issue repos only) | `backlog`, `todo`, `in-progress`, `in-review` | Visible open-state position when there's no Projects board. Skip on board repos — the board's **Status** field replaces these. Done / Cancelled / Duplicate aren't labels; they're the issue's close-reason (completed / not planned / duplicate). |
| **Flags / triage** | `blocked`, `needs-info`, `priority:high`, `priority:low`, plus GitHub's built-in `good first issue` + `help wanted` | Orthogonal signals that coexist with any status. Start here and **add more as patterns emerge** — labels are cheap, unenforced, and easy to retire. |
| **Type** | `type:bug`, `type:feature`, `type:improvement` | Issue type. GitHub Issues has no native type field — use labels (org-level **Issue Types** are an alternative if your org has them enabled). GitHub also seeds default labels (`bug`, `enhancement`, `duplicate`, `wontfix`, …) you can keep or replace. |

### Issue title and body conventions

- **Title:** imperative, scope-prefixed when natural — e.g. `[EXAMPLE_ISSUE_TITLE_1]`, `[EXAMPLE_ISSUE_TITLE_2]`, `[EXAMPLE_ISSUE_TITLE_3]`
- **Body must include:**
  - Acceptance criteria (what "done" looks like)
  - Link to the relevant plan doc (e.g., `[EXAMPLE_PLAN_PATH]` or a `docs/solutions/...md` reference if one already covers the area)
  - Tier label rationale (one sentence: "safety-critical because touches `[EXAMPLE_SAFETY_CRITICAL_PATH]`")

## Branching, commits, and PRs

### Branch naming

`<type>/<issue-number>-<short-slug>` (e.g. `feat/42-image-cards`)

- `<type>` ∈ `feat` | `fix` | `chore` | `docs` | `refactor` | `test`
- `<issue-number>` is the GitHub issue number — the **bare** number (e.g. `42`), no `#` and no team prefix. (`#` is awkward in branch names; reserve `#N` for references in commit/PR bodies, where GitHub auto-links it.) GitHub's native "Create a branch" button on an issue suggests `<number>-<slug>`; this convention just adds the `<type>/` prefix.
- `<short-slug>` is 2-5 hyphenated words derived from the issue title

Examples:

- `feat/12-[EXAMPLE_BRANCH_SLUG_1]`
- `fix/23-[EXAMPLE_BRANCH_SLUG_2]`
- `feat/42-[EXAMPLE_BRANCH_SLUG_3]`
- `docs/31-[EXAMPLE_BRANCH_SLUG_4]`

[BRANCH_CREATION_INSTRUCTION — one of:
  (A) Worktrees: "`/ce-worktree` creates branches following this convention when given an issue number."
  (B) Traditional: "Create branches with `git checkout -b <branch-name>` directly. Do not use `/ce-worktree` — this repo uses traditional in-place feature branches, not parallel worktrees."]

### Commit messages (conventional commits)

Format: `<type>(scope): subject`

- `<type>` matches the branch type (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`)
- `scope` is the affected subsystem — common scopes in this repo: [COMMON_SCOPES — e.g., `auth`, `db`, `pipeline`, `slack-hitl`, `ui`, `metadata`. List 6-12 actual scope names from the repo so future commits stay consistent.]
- Subject is imperative, lowercase, no period, ≤72 chars

Body references the issue: `Refs #N` for regular references (multiple commits per branch is normal). Use `Closes #N` only on the commit (or PR body) that genuinely closes the issue — on GitHub the keyword *actually closes* the issue once the commit/PR lands on the default branch, so reserve it for the one that finishes the work.

`/ce-commit` and `/ce-commit-push-pr` follow this convention and append the standard `Co-Authored-By: Claude ...` attribution.

Examples:

```
[EXAMPLE_COMMIT_MESSAGE_1 — e.g., "feat(auth): add password-reset email flow"]

[Two or three sentences naming what changed and why, in active voice.]

Refs #12
```

```
[EXAMPLE_COMMIT_MESSAGE_2 — e.g., "fix(billing): make webhook handler idempotent on retry"]

[Why the bug surfaced + what the fix does.]

Closes #23
```

### PR title

`<type>(scope): <descriptive subject>` — same shape as a commit subject. Keep the issue number **out** of the title; it lives in the PR body as `Closes #N`. (Closing keywords aren't parsed in titles anyway, and GitHub appends the PR's own `(#M)` number to the squash-merge commit, so a number in the title would just double up.)

Examples:

- `feat(scope): [EXAMPLE_PR_TITLE_SUBJECT_1]`
- `fix(scope): [EXAMPLE_PR_TITLE_SUBJECT_2]`
- `feat(scope): [EXAMPLE_PR_TITLE_SUBJECT_3]`

### PR body (must include)

- **`Closes #N`** as a top-level line — links the PR to the issue **and auto-closes it when the PR merges to the default branch** (real closure, not just an audit marker — the opposite of an external tracker; on a Projects board the built-in automation then moves the item to Done. See `## Issue tracking` § Issue lifecycle). Use `Refs #N` for partial work or supporting PRs that should link without closing.
- **Plan reference** — link to the relevant `[PLAN_DOC_PATH_EXAMPLE]` or `docs/solutions/...md` if applicable
- **Test plan** — bulleted checklist of what was verified before merge ([UNIT_TEST_FRAMEWORK] unit/integration runs, [E2E_FRAMEWORK] e2e runs, manual browser checks, smoke scripts)
- **Schema migrations** — [SCHEMA_MIGRATION_NOTE — e.g., "if the PR adds a Drizzle migration file, note the filename and confirm the underlying schema change was applied via Neon or Supabase MCP (the apply path in this repo; see `CLAUDE.md` § Commands). The Drizzle migration file is the synced record *after the fact*, not the apply source. **Never run `bun db:migrate` or `bun db:push` against this repo.**" Or delete this bullet if migrations don't apply to this repo.]
- **Out-of-scope callouts** — anything explicitly deferred to a follow-up issue, with the `#M` reference

`/ce-commit-push-pr` drafts the body following this structure — PR-description writing is built into that skill (its `references/pr-description-writing.md` is loaded internally during the push step), so no separate command is needed.

### Push

- First push: `git push -u origin <branch>` (sets upstream)
- Subsequent pushes: `git push`
- Never force-push to `main`. Force-push to feature branches is acceptable when rebasing pre-review (after the first reviewer has commented, prefer additive commits to preserve review thread anchors).

### Merge

- **Merge commit by default** — preserves the per-branch commit history on `main` so the development journey (review iterations, intermediate decisions, rationale-in-progress) stays inspectable via `git log --first-parent main` for the merge spine and full `git log` for the in-branch detail
- **Exception:** trivial PRs (single-commit chores, dep bumps, copy-edit fixes) where the in-branch history adds no signal — use squash merge to keep main from accumulating one-commit noise per chore
- Because every branch commit lands on `main`, the **Conventional Commits rules above are mandatory, not aspirational** — bad commit messages on a feature branch become permanent main-history noise. Reword sloppy WIP commits via interactive rebase before opening the PR (or before the final push if the PR is already open and pre-review)
- The PR body (and thus the merge commit) should carry the `Closes #N` reference. On merge to the default branch GitHub closes the issue automatically; on a Projects board the built-in *"PR merged → Done"* / *"issue closed → Done"* automation then moves the item — **verify** it landed (`gh issue view #N`) rather than assuming. Cancelled / Duplicate closes are manual (see `## Issue tracking` § Issue lifecycle)
- **Resolve automated reviewer threads as part of `/ce-resolve-pr-feedback`, before merging (not a separate optional pass that gets skipped)** — GitHub Copilot fires on every PR and frequently produces substantive technical findings (e.g., config keys that don't match what plugins actually expose, dead-code warnings, security smell). Treat Copilot review threads as a required reviewer pass at the same weight as human review, and handle them in the same `/ce-resolve-pr-feedback` step: after opening the PR, wait for Copilot's review to land, then for each comment read it, fix or reply, and mark the thread resolved via the GraphQL `resolveReviewThread` mutation (`gh api graphql -f query='mutation { resolveReviewThread(input:{threadId:"..."}) { thread { isResolved } } }'`). To find open threads, list them with `gh pr view <n> --json reviewThreads` or the GraphQL `reviewThreads` query and confirm each `isResolved: true` before merge. Do not merge with unresolved Copilot threads — fixing the diff in a follow-up PR after merging is the slower, noisier path
- Safety-critical PRs ([SAFETY_CRITICAL_PR_EXAMPLES — short list, e.g., "auth config, Drizzle migrations on critical tables, payment webhooks"]) require a green `/ce-code-review` before merge

### After merge

- Delete the feature branch (GitHub setting: delete head branches automatically; locally `git branch -d <branch>` after switching to main)
- `/ce-clean-gone-branches` periodically prunes locals whose remotes are gone
- If the work was non-trivial, run `/ce-compound` to capture the learning before context fades — writes to `docs/solutions/`
