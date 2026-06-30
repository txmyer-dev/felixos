import { distilledItems, rawSources, type ScopedDatabaseClient } from "@felixos/db";
import { runWithTenantContext } from "@felixos/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { KnowledgeSearchResult } from "@felixos/shared-types";

import { clampLimit } from "./validation.js";

export type KnowledgeSearchRow = Omit<typeof distilledItems.$inferSelect, "embedding"> & {
  sourceType: (typeof rawSources.$inferSelect)["sourceType"];
  sourceMetadata: Record<string, unknown>;
};

export type KnowledgeSearchOptions = {
  embedding: number[];
  entityId?: string;
  globalOnly?: boolean;
  limit?: number;
  tenantScopedDb: ScopedDatabaseClient;
  tenantId: string;
};

export async function searchKnowledge(
  opts: KnowledgeSearchOptions
): Promise<KnowledgeSearchResult[]> {
  const limit = clampLimit(opts.limit, 20, 100);
  const vector = toVectorSql(opts.embedding);

  const rows = await runWithTenantContext(opts.tenantId, () =>
    opts.tenantScopedDb.transaction((tx) =>
      tx
        .select({
          id: distilledItems.id,
          tenantId: distilledItems.tenantId,
          sourceId: distilledItems.sourceId,
          entityId: distilledItems.entityId,
          isGlobal: distilledItems.isGlobal,
          itemType: distilledItems.itemType,
          content: distilledItems.content,
          status: distilledItems.status,
          correctionText: distilledItems.correctionText,
          embeddingModel: distilledItems.embeddingModel,
          createdAt: distilledItems.createdAt,
          updatedAt: distilledItems.updatedAt,
          sourceType: rawSources.sourceType,
          sourceMetadata: rawSources.metadata
        })
        .from(distilledItems)
        .innerJoin(rawSources, eq(distilledItems.sourceId, rawSources.id))
        .where(
          and(
            inArray(distilledItems.status, ["accepted", "corrected"]),
            opts.entityId ? eq(distilledItems.entityId, opts.entityId) : undefined,
            opts.globalOnly ? eq(distilledItems.isGlobal, true) : undefined
          )
        )
        .orderBy(sql`${distilledItems.embedding} <=> ${vector}::vector`)
        .limit(limit)
    )
  );

  return rows.map(toSearchResult);
}

function toSearchResult(row: KnowledgeSearchRow): KnowledgeSearchResult {
  const content =
    row.status === "corrected" && row.correctionText ? row.correctionText : row.content;
  return {
    id: row.id,
    tenantId: row.tenantId,
    entityId: row.entityId,
    isGlobal: row.isGlobal,
    itemType: row.itemType,
    content,
    status: row.status,
    correctionText: row.correctionText,
    embeddingModel: row.embeddingModel,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    source: {
      id: row.sourceId,
      sourceType: row.sourceType,
      metadata: row.sourceMetadata
    }
  };
}

function toVectorSql(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
