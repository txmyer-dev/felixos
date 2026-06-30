---
module: n8n-integration
tags:
  - phase-4
  - n8n
  - skills
  - trust-ladder
problem_type: architecture-pattern
---

# n8n Workflow Webhook Invocation

Phase 4 keeps n8n's two integration surfaces separate:

- `packages/integrations/src/n8n/client.ts` wraps n8n's `/api/v1` management API for workflow and execution reads plus activate/deactivate/retry/stop controls.
- Workflow invocation does not use `/api/v1`; `packages/agent/src/skills/n8n-workflow.ts` posts to the registered workflow's own `webhook_url`.
- `tenant_n8n_skills` stores explicit tenant opt-ins, webhook URL, optional encrypted header auth, input schema, and default trust rung.
- Dynamic n8n skills are built per request by `createN8nWorkflowSkills`, then joined with the static registry in `apps/api/src/routes/agent.ts`.
- The same skill object handles immediate execution and pending approval, so `draft-and-wait` withholds the webhook call until `/agent/pending/:id/approve`.

This avoids exposing every shared n8n workflow to every tenant and prevents future agents from looking for a generic "run workflow by id" management endpoint that n8n does not provide.
