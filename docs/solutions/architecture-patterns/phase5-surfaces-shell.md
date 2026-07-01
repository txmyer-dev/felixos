---
module: web
tags:
  - phase-5
  - nextjs
  - auth-gate
  - playwright
  - surfaces
problem_type: architecture-pattern
---

# Phase 5 Surfaces Shell

Phase 5 established the first real FelixOS product surface:

- `apps/web/proxy.ts` is the protected-route gate. It only checks for the `felixos_session` cookie and keeps stamping `x-felixos-tenant-slug`; full session validation still happens in `apps/api/src/middleware/auth.ts`.
- `apps/web/lib/api.ts` is the required server-side fetch path for protected pages. A `401` redirects to `/login`, so every protected route should call `apiFetch()` at least once.
- `apps/web/app/(app)/layout.tsx` owns the desktop sidebar shell. The root route is command-center, while accounts moved to `apps/web/app/(app)/accounts/page.tsx`.
- `apps/web/components/ui/*` contains the first shared UI primitives. Keep later operational UI dense and scannable, and reuse these primitives before adding new component shapes.
- `apps/api/src/routes/knowledge.ts` now exposes `GET /knowledge/items` for review lists and command-center knowledge feeds.
- `apps/api/src/routes/agent.ts` normalizes pending actions with `targetEntityId`, supports status filters on `GET /agent/pending`, and allows editing the primary pending-action text before approval.
- `scripts/seed-demo.ts` backs `pnpm db:seed`. Set `FELIXOS_DEMO_TOTP_SECRET` for deterministic Playwright login; do not commit generated `apps/web/playwright/.auth/*` state.

For browser verification, unauthenticated auth-gate coverage can run without the API stack via the Playwright `unauthenticated` project. The authenticated shell specs require the API, Postgres migrations, `pnpm db:seed`, and a matching `FELIXOS_DEMO_TOTP_SECRET`.
