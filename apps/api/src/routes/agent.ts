import { resolveInferenceProvider, runAgent } from "@felixos/agent";
import { tenantSkillRungs, pendingActions } from "@felixos/db";
import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { searchKnowledge } from "../lib/knowledge-search.js";
import { createKnowledgeRetrievalTool } from "@felixos/agent/tools/knowledge-retrieval.js";
import { withRequestTenant } from "./context.js";
import type { TrustRung } from "@felixos/shared-types";

type AgentRunBody = {
  query?: string;
  entityId?: string;
};

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: AgentRunBody }>("/run", async (request, reply) => {
    const { query, entityId } = request.body ?? {};

    if (!query?.trim()) {
      return reply
        .status(400)
        .send({ ok: false, error: { code: "bad_request", message: "query is required" } });
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

    return reply.send({ ok: true, data: { response: result.response, pendingActionIds } });
  });

  fastify.get("/pending", async (request, reply) => {
    const rows = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .select()
          .from(pendingActions)
          .where(
            and(
              eq(pendingActions.tenantId, request.tenantId),
              eq(pendingActions.status, "pending")
            )
          )
          .orderBy(pendingActions.createdAt)
      )
    );

    return reply.send({ ok: true, data: rows.map(toPendingActionView) });
  });

  fastify.post<{ Params: { id: string } }>("/pending/:id/approve", async (request, reply) => {
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .select()
          .from(pendingActions)
          .where(eq(pendingActions.id, request.params.id))
          .limit(1)
      )
    );

    if (!row) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: "not_found", message: "Pending action not found" } });
    }

    if (row.status !== "pending") {
      return reply.status(409).send({
        ok: false,
        error: { code: "conflict", message: `Action already ${row.status}` }
      });
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

    return reply.send({ ok: true, data: toPendingActionView(updated!) });
  });

  fastify.post<{ Params: { id: string } }>("/pending/:id/reject", async (request, reply) => {
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .select()
          .from(pendingActions)
          .where(eq(pendingActions.id, request.params.id))
          .limit(1)
      )
    );

    if (!row) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: "not_found", message: "Pending action not found" } });
    }

    if (row.status !== "pending") {
      return reply.status(409).send({
        ok: false,
        error: { code: "conflict", message: `Action already ${row.status}` }
      });
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

    return reply.send({ ok: true, data: toPendingActionView(updated!) });
  });

  fastify.put<{ Params: { skillName: string }; Body: { rung?: string } }>(
    "/rungs/:skillName",
    async (request, reply) => {
      const { rung } = request.body ?? {};
      if (!isValidRung(rung)) {
        return reply.status(400).send({
          ok: false,
          error: { code: "bad_request", message: "rung must be one of: suggest, draft-and-wait, act-and-log, full-auto" }
        });
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

      return reply.send({ ok: true, data: row });
    }
  );
};

const validRungs = new Set<TrustRung>(["suggest", "draft-and-wait", "act-and-log", "full-auto"]);

function isValidRung(value: unknown): value is TrustRung {
  return typeof value === "string" && validRungs.has(value as TrustRung);
}

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
