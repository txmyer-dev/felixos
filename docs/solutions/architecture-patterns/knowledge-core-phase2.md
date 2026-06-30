---
module: knowledge-core
tags:
  - phase-2
  - fastify
  - pgvector
  - rls
problem_type: architecture-pattern
---

# Knowledge Core Phase 2

Phase 2 adds the API layer around the Foundation knowledge schema:

- `packages/shared-types/src/knowledge.ts` is the shared vocabulary for source types, distilled item types, statuses, and API response views.
- `apps/api/src/lib/llm.ts` is the intentionally thin OpenAI-compatible shim. Tests inject `LlmShim` through `buildServer({ llm })`; production builds the real shim from `LLM_API_KEY`, optional `LLM_BASE_URL`, `DISTILLATION_MODEL`, and `EMBEDDING_MODEL`.
- `apps/api/src/routes/knowledge.ts` owns `/knowledge/sources`, `/knowledge/distill/:sourceId`, `/knowledge/search`, and `/knowledge/items/:id`.
- `apps/api/src/knowledge.integration.test.ts` is the Phase 2 gate for tenant isolation, idempotent distillation, status filtering, citations, and entity-scoped/global retrieval.

Keep route data access behind `withRequestTenant` plus `scopedDb.transaction`. Search uses pgvector cosine distance via `<=>`, and only `accepted` or `corrected` distilled items are retrievable.
