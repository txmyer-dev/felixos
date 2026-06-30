import { resolveInferenceProvider, runAgent } from "@felixos/agent";
import { tenantSkillRungs, pendingActions } from "@felixos/db";
import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { searchKnowledge } from "../lib/knowledge-search.js";
import { sendBadRequest, sendConflict, sendNotFound, sendSuccess } from "../lib/responses.js";
import { createSetGuard } from "../lib/validation.js";
import { createKnowledgeRetrievalTool } from "@felixos/agent/tools/knowledge-retrieval.js";
import { withRequestTenant } from "./context.js";
import type { TrustRung } from "@felixos/shared-types";

const isValidRung = createSetGuard<TrustRung>(
  new Set<TrustRung>(["suggest", "draft-and-wait", "act-and-log", "full-auto"])
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

    const result = await runAgent({
      query,
      tools: [knowledgeTool],
      provider,
      tenantId: request.tenantId,
      ...(entityId !== undefined ? { entityId } : {})
    });

    return sendSuccess(reply, { response: result.response, pendingActionIds });
  });

  fastify.get("/pending", async (request, reply) => {
    const rows = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .select()
          .from(pendingActions)
          .where(
            and(eq(pendingActions.tenantId, request.tenantId), eq(pendingActions.status, "pending"))
          )
          .orderBy(pendingActions.createdAt)
      )
    );

    return sendSuccess(reply, rows.map(toPendingActionView));
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

    const [updated] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .update(pendingActions)
          .set({ status: "approved", updatedAt: new Date() })
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

function toPendingActionView(row: typeof pendingActions.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    skillName: row.skillName,
    payload: row.payload,
    status: row.status,
    agentContext: row.agentContext,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
