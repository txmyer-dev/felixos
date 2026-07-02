# FelixOS

A multi-tenant internal operating system for running a managed service provider (MSP) — one congruent surface where an AI agent works across email, Slack, meetings, and ingested knowledge. Built for working *on* the business, not *in* it.

## Start here

- **Architecture & build approach:** [`docs/plans/2026-06-29-001-feat-felixos-architecture-approach-plan.md`](docs/plans/2026-06-29-001-feat-felixos-architecture-approach-plan.md) — read this before working any issue.
- **Product requirements:** [`docs/plans/2026-06-28-001-feat-felixos-internal-os-plan.md`](docs/plans/2026-06-28-001-feat-felixos-internal-os-plan.md)
- **Foundation phase plan:** [`docs/plans/2026-06-29-002-feat-felixos-foundation-phase-plan.md`](docs/plans/2026-06-29-002-feat-felixos-foundation-phase-plan.md)

## Stack

TypeScript end-to-end in a Turborepo monorepo. Postgres 18 + pgvector with Drizzle, multi-tenant via Postgres RLS. Node.js/Fastify API with AsyncLocalStorage request context; Next.js web. OpenAI Agents SDK with a provider-agnostic abstraction over OpenAI-compatible endpoints. Deterministic automation on self-hosted n8n over REST. Docker Compose on a VPS.

## Build model

Built horizontally, phase by phase. Each phase's plan decomposes into contracts-first, parallelizable GitHub issues so multiple agents can work different units concurrently. Tests are checkpoint gates per issue and integration gates per phase.

Phases: 1 Foundation · 2 Knowledge core · 3 Agent + skills registry · 4 n8n integration · 5 Surfaces.

## Deployment

FelixOS is designed to be deployed to a VPS using Docker Compose. For operators setting up a new instance, follow these runbooks in order:
- **[VPS Deployment Runbook](docs/deploy/vps-compose.md)**: Setup, secrets, build, and provisioning steps.
- **[Edge Security](docs/deploy/edge-security.md)**: Verifying HTTPS, rate limiting, and private port configurations.
- **[Backup, Restore & Rollbacks](docs/deploy/backup-restore.md)**: Securing your encrypted TOTP keys and database volumes.
