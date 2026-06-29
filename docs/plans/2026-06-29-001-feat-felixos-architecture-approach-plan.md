---
title: FelixOS - Architecture and Build Approach
type: feat
date: 2026-06-29
topic: felixos-architecture-approach
artifact: approach-plan
execution: planning-guide
origin: docs/plans/2026-06-28-001-feat-felixos-internal-os-plan.md
---

# FelixOS - Architecture and Build Approach

**Target repo:** FelixOS (greenfield). All paths below are repo-relative to the FelixOS root.

This is the canonical architecture decision record and phased build sequence for FelixOS. It is the shared ground truth for a multi-agent build (Claude, Gemini, Codex working different GitHub issues in parallel) — read this before working any FelixOS issue. The product requirements it serves live in the requirements-only plan at `docs/plans/2026-06-28-001-feat-felixos-internal-os-plan.md`.

This is an approach-plan (a plan for *how* the deliverable is built), not an implementation plan. Per-phase implementation plans — each decomposed into GitHub issues — are produced separately from this foundation.

---

## Stack decisions

- **TypeScript end-to-end.** One language across backend, agent orchestration, and web UI.
- **Turborepo monorepo.** Single repo with workspaces: `apps/web` (Next.js UI), `apps/api` (backend), and `packages/*` (`db`, `agent`, `skills`, `shared-types`, `integrations`). Chosen while greenfield makes it cheap; collapsible to split repos later if it chafes. The OpenAI Agents SDK is workspace-agnostic and lives in `packages/agent` — the monorepo imposes no constraint on it.
- **Postgres 18 + `pgvector`.** Single datastore for the entity spine, raw knowledge, distilled facts, and embeddings. Server-side Postgres and n8n version bumps are handled out-of-band by the operator.
- **Next.js (React)** for the rich surfaces.
- **Drizzle ORM** as the type-safe query layer; multi-tenant scoping flows through it with Postgres RLS as the enforced backstop.
- **Passwordless TOTP auth for all tenants** — a per-tenant secret issued at creation, the time-based code as the sole factor, no passwords and no resets; recovery via re-issued secret plus backup recovery codes. Tenant is resolved by subdomain/slug before the code is validated.
- **Docker Compose on the VPS**, alongside the existing self-hosted n8n container.

---

## Inference and embeddings (provider-agnostic)

- **OpenAI Agents SDK (TS)** for agent orchestration.
- **Provider abstraction over OpenAI-compatible endpoints** for *all* inference including embeddings: OpenAI, `freellmapi` (`https://github.com/tashfeenahmed/freellmapi`), and OpenRouter. The abstraction exposes a `supportsTools` capability flag — a no-op for the curated `freellmapi` set (already filtered to tool-calling models only) and for OpenAI, its real job is policing OpenRouter's open catalog.
- **Per-tenant inference config.** Each tenant (operator, demo, future customer) points at its own provider, key, and model. The client-facing "choose your inference" UI is deferred to the storefront; the provider-agnostic architecture is built now.
- **Embeddings pinned at 1024 dimensions.** Every embedding model must emit exactly 1024 dims (natively or via a dimensions/truncation parameter). Each stored vector records its source model name. Retrieval is tenant-scoped, so within-tenant consistency is what matters; a tenant changing embedding models is a known re-embed job, not silent drift.

---

## Multi-tenancy

Row-level isolation: a `tenant_id` on every table, enforced by Postgres Row-Level Security so a query cannot leak across tenants even if app code slips. One database, one schema. The operator's tenant and the demo tenant are ordinary rows. A sold single-tenant instance runs with its own tenant plus the dormant seeded demo tenant.

---

## Knowledge core

Raw source rows (email, Slack, meeting/audio transcript, video, doc) feed an LLM distillation pass that writes fact / decision / action rows. Each distilled row carries `source_id`, `tenant_id`, and either an `entity_id` (account-scoped) or a global flag. Embeddings (1024-dim) land in `pgvector`. The agent retrieves and answers with citations that resolve back to raw source. The correct/reject loop is a status on distilled rows that retrieval respects.

---

## Skills registry

A typed registry where each skill declares a descriptor: name, purpose, inputs, side-effect class, and trust-ladder rung. The agent sees descriptors, not implementations. Three adapter kinds behind one interface:

- **In-process skills** — Claude-skill-file format primary (with a possible Python path, since the existing skills have run under Gemini). The operator's existing YouTube-ingestion skill registers here.
- **Action skills** — draft/send email, create task, schedule, update record.
- **n8n-workflow skills** — invoke n8n over REST.

The descriptor interface carries the per-skill trust ladder (suggest, draft-and-wait, act-and-log, full-auto). The operator's older bloated registry repo is a mining source during the agent phase — port what survives, cull the rest.

---

## n8n integration

A REST client module: read workflows, executions, and failures for the management surface; trigger workflows as registered skills; surface failed runs as one-click "needs you" items. REST (not MCP) keeps n8n out of the agent's token context.

---

## Transcription

Two capture-skill adapters behind one interface, routed by media type:

- **Deepgram** — video files.
- **Voicebox** (self-hosted repo/model) — voice and meetings.

---

## Surfaces

- **Command-center "today"** — home; what needs the operator, agent-drafted actions awaiting approval with citations, act-and-log activity, meetings with prep, fresh distilled knowledge.
- **Account view** — the drill-in; one congruent screen per account.
- **Triage mode** — agent-ranked queue across channels.
- **Direct-action principle** — any actionable item links in one click to the exact object in context.

---

## Build model and workflow

- **Horizontal build.** The whole platform is built layer by layer, not as a vertical slice. Priority is base structures that everything else depends on.
- **Plan to GitHub issues.** Each phase's implementation plan decomposes into parallelizable GitHub issues so multiple agents (Claude, Gemini, Codex) can work different parts simultaneously.
- **Contracts-first.** The dependency-zero issues in each phase lock shared contracts — DB schema, the tenant model, the skill descriptor interface, API types in `packages/shared-types` — before anything depends on them. This is what makes parallel multi-agent work collision-safe.
- **Tests as checkpoint gates.** Each issue ends with a test gate ("does this code pass its test?"). Each phase ends with an integration test ("do these issues combine into a working feature?"). Not test-first; tests are explicit completion criteria.

---

## Phased build sequence

Each phase becomes its own issue-decomposed implementation plan, built on the prior.

1. **Foundation** — monorepo scaffolding, Docker Compose, Postgres + `pgvector`, Drizzle, multi-tenant data layer + RLS, entity spine (accounts, contacts, deals, interactions), passwordless TOTP auth for all tenants, seeded demo tenant, CI gates, and the `shared-types` contracts every later phase imports.
2. **Knowledge core** — raw store, `pgvector` (1024-dim), distillation pass, scoped and global memory, cited retrieval, correct/reject loop.
3. **Agent + skills registry** — the descriptor interface, trust-ladder and autonomy enforcement, provider abstraction + OpenAI Agents SDK wiring, first capture-skills (incl. the YouTube skill adapter) and action-skills, legacy-registry mining.
4. **n8n integration** — REST client, management surface, workflows-as-skills, failure surfacing.
5. **Surfaces** — command-center home, account view, triage mode, one-click direct-action deep-linking.

---

## Open items (resolve at the relevant phase, not blocking Foundation)

- Per-provider embedding model selection that conforms to the 1024-dim pin (native vs. dimensions-parameter truncation).
- Re-embed strategy when a tenant changes embedding model.
- Voicebox integration specifics (API surface of the self-hosted model).
- Legacy registry repo audit — what to port vs. cull.

---

## Product Contract deltas vs. the requirements plan

Recorded so the WHAT/HOW boundary stays visible:

- **Added (product-facing):** per-tenant inference provider choice. The architecture is built now; the client-facing selection UI stays in the deferred storefront.
- **Refined:** transcription is Deepgram (video) + Voicebox (voice/meetings); embeddings and all inference go through OpenAI-compatible providers.
- **Changed:** auth is passwordless TOTP for *all* tenants (per-tenant secret at creation; no username/password; no password resets; recovery via re-issued secret + backup codes) — supersedes the requirements plan's demo-only-TOTP / full-auth-for-real-tenants split.
