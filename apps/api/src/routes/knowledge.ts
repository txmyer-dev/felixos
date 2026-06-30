import { distilledItems, rawSources } from "@felixos/db";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type {
  DistilledItemStatus,
  DistilledItemType,
  KnowledgeSourceType
} from "@felixos/shared-types";
import type { FastifyPluginAsync } from "fastify";

import { searchKnowledge } from "../lib/knowledge-search.js";
import {
  sendBadRequest,
  sendCreated,
  sendError,
  sendNotFound,
  sendSuccess
} from "../lib/responses.js";
import { clampLimit, createSetGuard } from "../lib/validation.js";
import { withRequestTenant } from "./context.js";

const isKnowledgeSourceType = createSetGuard<KnowledgeSourceType>(
  new Set<KnowledgeSourceType>(["email", "slack", "transcript", "youtube", "doc", "note"])
);
const isDistilledItemStatus = createSetGuard<DistilledItemStatus>(
  new Set<DistilledItemStatus>(["pending", "accepted", "rejected", "corrected"])
);

type SourceBody = {
  sourceType?: string;
  content?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export const knowledgeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/sources", async (request, reply) => {
    const rows = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx.select().from(rawSources).orderBy(rawSources.createdAt)
      )
    );
    return sendSuccess(reply, rows.map(toRawSourceView));
  });

  fastify.post<{ Body: SourceBody }>("/sources", async (request, reply) => {
    const { sourceType, content, entityId = null, metadata = {} } = request.body ?? {};

    if (!isKnowledgeSourceType(sourceType)) {
      return sendBadRequest(reply, "sourceType is required");
    }
    if (!content?.trim()) {
      return sendBadRequest(reply, "content is required");
    }

    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .insert(rawSources)
          .values({
            id: randomUUID(),
            tenantId: request.tenantId,
            entityId,
            sourceType,
            content,
            metadata
          })
          .returning()
      )
    );

    return sendCreated(reply, toRawSourceView(row!));
  });

  fastify.post<{
    Params: { sourceId: string };
    Querystring: { force?: string | boolean };
  }>("/distill/:sourceId", async (request, reply) => {
    const force = request.query.force === true || request.query.force === "true";

    try {
      const result = await withRequestTenant(request, () =>
        request.server.scopedDb.transaction(async (tx) => {
          const [source] = await tx
            .select()
            .from(rawSources)
            .where(eq(rawSources.id, request.params.sourceId))
            .limit(1);
          if (!source) return { kind: "not_found" as const };

          if (!force) {
            const existing = await tx
              .select()
              .from(distilledItems)
              .where(
                and(
                  eq(distilledItems.sourceId, source.id),
                  sql`${distilledItems.status} <> 'rejected'`
                )
              )
              .orderBy(distilledItems.createdAt);
            if (existing.length > 0) return { kind: "existing" as const, rows: existing };
          } else {
            await tx.delete(distilledItems).where(eq(distilledItems.sourceId, source.id));
          }

          const drafts = await request.server.llm.distill(source.content, source.sourceType);
          const rowsToInsert = [];
          for (const draft of drafts) {
            rowsToInsert.push({
              id: randomUUID(),
              tenantId: request.tenantId,
              sourceId: source.id,
              entityId: source.entityId,
              isGlobal: source.entityId === null,
              itemType: draft.type,
              content: draft.content,
              embedding: await request.server.llm.embed(draft.content),
              embeddingModel: request.server.llm.embeddingModel
            });
          }

          if (rowsToInsert.length === 0) return { kind: "created" as const, rows: [] };

          const rows = await tx.insert(distilledItems).values(rowsToInsert).returning();
          return { kind: "created" as const, rows };
        })
      );

      if (result.kind === "not_found") {
        return sendNotFound(reply, "Source not found");
      }

      return reply
        .status(result.kind === "existing" ? 200 : 201)
        .send({ ok: true, data: result.rows.map(toDistilledItemView) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM request failed";
      return sendError(reply, 502, "llm_error", message);
    }
  });

  fastify.get<{
    Querystring: { q?: string; entityId?: string; globalOnly?: string | boolean; limit?: string };
  }>("/search", async (request, reply) => {
    const q = request.query.q?.trim();
    const globalOnly = request.query.globalOnly === true || request.query.globalOnly === "true";
    const { entityId } = request.query;

    if (!q) {
      return sendBadRequest(reply, "q is required");
    }
    if (entityId && globalOnly) {
      return sendBadRequest(reply, "entityId and globalOnly are mutually exclusive");
    }

    const limit = clampLimit(request.query.limit);

    try {
      const embedding = await request.server.llm.embed(q);
      const rows = await searchKnowledge({
        embedding,
        ...(entityId !== undefined ? { entityId } : {}),
        ...(globalOnly ? { globalOnly } : {}),
        limit,
        tenantScopedDb: request.server.scopedDb,
        tenantId: request.tenantId
      });

      return sendSuccess(reply, rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM request failed";
      return sendError(reply, 502, "llm_error", message);
    }
  });

  fastify.patch<{
    Params: { id: string };
    Body: { status?: string; correctionText?: string | null };
  }>("/items/:id", async (request, reply) => {
    const { status, correctionText = null } = request.body ?? {};
    if (!isDistilledItemStatus(status)) {
      return sendBadRequest(reply, "status is required");
    }
    if (status === "corrected" && !correctionText?.trim()) {
      return sendBadRequest(reply, "correctionText is required for corrected items");
    }

    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .update(distilledItems)
          .set({
            status,
            correctionText: status === "corrected" ? correctionText : null,
            updatedAt: new Date()
          })
          .where(eq(distilledItems.id, request.params.id))
          .returning()
      )
    );

    if (!row) {
      return sendNotFound(reply, "Knowledge item not found");
    }

    return sendSuccess(reply, toDistilledItemView(row));
  });
};

function toRawSourceView(row: typeof rawSources.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    entityId: row.entityId,
    sourceType: row.sourceType,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString()
  };
}

function toDistilledItemView(row: Omit<typeof distilledItems.$inferSelect, "embedding">) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sourceId: row.sourceId,
    entityId: row.entityId,
    isGlobal: row.isGlobal,
    itemType: row.itemType as DistilledItemType,
    content: row.status === "corrected" && row.correctionText ? row.correctionText : row.content,
    status: row.status,
    correctionText: row.correctionText,
    embeddingModel: row.embeddingModel,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
