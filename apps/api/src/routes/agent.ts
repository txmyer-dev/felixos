import {
  createDbTrustLadderStore,
  createN8nWorkflowSkills,
  createSkillTool,
  defaultRegistry,
  resolveInferenceProvider,
  runAgent
} from "@felixos/agent";
import { tenantSkillRungs, pendingActions } from "@felixos/db";
import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { searchKnowledge } from "../lib/knowledge-search.js";
import {
  sendBadRequest,
  sendConflict,
  sendError,
  sendNotFound,
  sendSuccess
} from "../lib/responses.js";
import { createSetGuard } from "../lib/validation.js";
import { withRequestTenant } from "./context.js";
import { createKnowledgeRetrievalTool } from "@felixos/agent/tools/knowledge-retrieval.js";
import type { PendingActionStatus, TrustRung } from "@felixos/shared-types";

const isValidRung = createSetGuard<TrustRung>(
  new Set<TrustRung>(["suggest", "draft-and-wait", "act-and-log", "full-auto"])
);
const isPendingActionStatus = createSetGuard<PendingActionStatus>(
  new Set<PendingActionStatus>([
    "pending",
    "approved",
    "rejected",
    "executed",
    "failed",
    "reversed"
  ])
);

type AgentRunBody = {
  query?: string;
  entityId?: string;
};

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: AgentRunBody }>("/run", async (request, reply) => {
    const { query, entityId } = request.body ?? {};

    if (!query?.trim()) {
      return sendBadRequest(reply, "query is required");
    }

    const provider = await withRequestTenant(request, () =>
      resolveInferenceProvider({
        scopedDb: request.server.scopedDb,
        tenantId: request.tenantId,
        encryptionKey: request.server.encryptionKey
      })
    );

    const embed = request.server.llm.embed.bind(request.server.llm);

    const knowledgeTool = createKnowledgeRetrievalTool({
      embed,
      search: async (embedding, opts) =>
        searchKnowledge({
          embedding,
          ...(opts?.entityId !== undefined ? { entityId: opts.entityId } : {}),
          tenantScopedDb: request.server.scopedDb,
          tenantId: request.tenantId
        })
    });

    const pendingActionIds: string[] = [];
    const store = createDbTrustLadderStore({
      scopedDb: request.server.scopedDb,
      tenantId: request.tenantId
    });
    const skillCtx = {
      tenantId: request.tenantId,
      scopedDb: request.server.scopedDb,
      provider,
      encryptionKey: request.server.encryptionKey
    };
    const n8nSkills = await createN8nWorkflowSkills({
      tenantId: request.tenantId,
      scopedDb: request.server.scopedDb,
      n8nClient: request.server.n8n,
      fetchImpl: request.server.n8nWebhookFetch
    });

    const staticSkills = defaultRegistry.listDescriptors().map((d) => defaultRegistry.get(d.name)!);
    const skillTools = [...staticSkills, ...n8nSkills].map((skill) =>
      createSkillTool({
        skill,
        ctx: skillCtx,
        store,
        onOutcome: (outcome) => {
          if (outcome.kind === "pending" && outcome.id) {
            pendingActionIds.push(outcome.id);
          }
        }
      })
    );

    let result;
    try {
      result = await runAgent({
        query,
        tools: [knowledgeTool, ...skillTools],
        provider,
        tenantId: request.tenantId,
        ...(entityId !== undefined ? { entityId } : {})
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent execution failed";
      return sendError(reply, 502, "agent_error", message);
    }

    return sendSuccess(reply, { response: result.response, pendingActionIds });
  });

  fastify.get<{ Querystring: { status?: string } }>("/pending", async (request, reply) => {
    const status = request.query.status ?? "pending";
    if (!isPendingActionStatus(status)) {
      return sendBadRequest(
        reply,
        "status must be one of: pending, approved, rejected, executed, failed, reversed"
      );
    }

    const rows = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .select()
          .from(pendingActions)
          .where(
            and(eq(pendingActions.tenantId, request.tenantId), eq(pendingActions.status, status))
          )
          .orderBy(pendingActions.createdAt)
      )
    );

    return sendSuccess(reply, rows.map(toPendingActionView));
  });

  fastify.patch<{
    Params: { id: string };
    Body: { text?: string };
  }>("/pending/:id", async (request, reply) => {
    const text = request.body?.text?.trim();
    if (!text) {
      return sendBadRequest(reply, "text is required");
    }

    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx.select().from(pendingActions).where(eq(pendingActions.id, request.params.id)).limit(1)
      )
    );

    if (!row) {
      return sendNotFound(reply, "Pending action not found");
    }

    if (row.status !== "pending") {
      return sendConflict(reply, `Action already ${row.status}`);
    }

    const payload = editPrimaryPayloadText(row.payload, text);
    const [updated] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .update(pendingActions)
          .set({ payload, updatedAt: new Date() })
          .where(eq(pendingActions.id, request.params.id))
          .returning()
      )
    );

    return sendSuccess(reply, toPendingActionView(updated!));
  });

  fastify.post<{ Params: { id: string } }>("/pending/:id/approve", async (request, reply) => {
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx.select().from(pendingActions).where(eq(pendingActions.id, request.params.id)).limit(1)
      )
    );

    if (!row) {
      return sendNotFound(reply, "Pending action not found");
    }

    if (row.status !== "pending") {
      return sendConflict(reply, `Action already ${row.status}`);
    }

    const skill = await findSkillForPendingAction(row.skillName, request);
    const skillCtx = {
      tenantId: request.tenantId,
      scopedDb: request.server.scopedDb,
      provider: {},
      encryptionKey: request.server.encryptionKey
    };

    let outcome: { result?: unknown; reversal?: unknown } | void | undefined;
    if (skill?.afterApproval) {
      outcome = await withRequestTenant(request, () =>
        skill.afterApproval!(row.payload as Parameters<typeof skill.afterApproval>[0], skillCtx)
      );
    }

    // Persist the commit's result/reversal so the executed ledger row is
    // reversible — mirrors the act-and-log path in the trust-ladder store.
    const nextStatus = skill?.afterApproval ? "executed" : "approved";
    const [updated] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .update(pendingActions)
          .set({
            status: nextStatus,
            ...(outcome && "result" in outcome && outcome.result !== undefined
              ? { result: outcome.result as Record<string, unknown> }
              : {}),
            ...(outcome && "reversal" in outcome && outcome.reversal !== undefined
              ? { reversal: outcome.reversal as Record<string, unknown> }
              : {}),
            updatedAt: new Date()
          })
          .where(eq(pendingActions.id, request.params.id))
          .returning()
      )
    );

    return sendSuccess(reply, toPendingActionView(updated!));
  });

  fastify.post<{ Params: { id: string } }>("/pending/:id/reject", async (request, reply) => {
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx.select().from(pendingActions).where(eq(pendingActions.id, request.params.id)).limit(1)
      )
    );

    if (!row) {
      return sendNotFound(reply, "Pending action not found");
    }

    if (row.status !== "pending") {
      return sendConflict(reply, `Action already ${row.status}`);
    }

    const [updated] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .update(pendingActions)
          .set({ status: "rejected", updatedAt: new Date() })
          .where(eq(pendingActions.id, request.params.id))
          .returning()
      )
    );

    return sendSuccess(reply, toPendingActionView(updated!));
  });

  fastify.put<{ Params: { skillName: string }; Body: { rung?: string } }>(
    "/rungs/:skillName",
    async (request, reply) => {
      const { rung } = request.body ?? {};
      if (!isValidRung(rung)) {
        return sendBadRequest(
          reply,
          "rung must be one of: suggest, draft-and-wait, act-and-log, full-auto"
        );
      }

      const [row] = await withRequestTenant(request, () =>
        request.server.scopedDb.transaction((tx) =>
          tx
            .insert(tenantSkillRungs)
            .values({
              tenantId: request.tenantId,
              skillName: request.params.skillName,
              rung,
              updatedAt: new Date()
            })
            .onConflictDoUpdate({
              target: [tenantSkillRungs.tenantId, tenantSkillRungs.skillName],
              set: { rung, updatedAt: new Date() }
            })
            .returning()
        )
      );

      return sendSuccess(reply, row);
    }
  );
};

async function findSkillForPendingAction(skillName: string, request: FastifyRequest) {
  const staticSkill = defaultRegistry.get(skillName);
  if (staticSkill) return staticSkill;

  const n8nSkills = await createN8nWorkflowSkills({
    tenantId: request.tenantId,
    scopedDb: request.server.scopedDb,
    n8nClient: request.server.n8n,
    fetchImpl: request.server.n8nWebhookFetch
  });
  return n8nSkills.find((skill) => skill.descriptor.name === skillName);
}

function toPendingActionView(row: typeof pendingActions.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    skillName: row.skillName,
    payload: row.payload,
    status: row.status,
    targetEntityId: resolveTargetEntityId(row.payload),
    agentContext: row.agentContext,
    reversedAt: row.reversedAt ? row.reversedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function resolveTargetEntityId(payload: Record<string, unknown>): string | null {
  const candidate = payload.entityId ?? payload.accountId;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function editPrimaryPayloadText(
  payload: Record<string, unknown>,
  text: string
): Record<string, unknown> {
  if (typeof payload.body === "string") {
    return { ...payload, body: text };
  }
  if (typeof payload.summary === "string") {
    return { ...payload, summary: text };
  }
  if (typeof payload.content === "string") {
    return { ...payload, content: text };
  }
  return { ...payload, content: text };
}
