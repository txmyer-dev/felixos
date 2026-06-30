import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector
} from "drizzle-orm/pg-core";

import { entities } from "./entities.js";
import { tenants } from "./tenants.js";

export const knowledgeSourceTypeEnum = pgEnum("knowledge_source_type", [
  "email",
  "slack",
  "transcript",
  "youtube",
  "doc",
  "note"
]);

export const distilledItemTypeEnum = pgEnum("distilled_item_type", ["fact", "decision", "action"]);

export const distilledItemStatusEnum = pgEnum("distilled_item_status", [
  "pending",
  "accepted",
  "rejected",
  "corrected"
]);

export const rawSources = pgTable(
  "raw_sources",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id"),
    sourceType: knowledgeSourceTypeEnum("source_type").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("raw_sources_tenant_id_idx").on(table.tenantId),
    index("raw_sources_entity_id_idx").on(table.entityId),
    uniqueIndex("raw_sources_tenant_id_id_unique").on(table.tenantId, table.id),
    foreignKey({
      columns: [table.tenantId, table.entityId],
      foreignColumns: [entities.tenantId, entities.id],
      name: "raw_sources_tenant_entity_fk"
    }).onDelete("set null")
  ]
);

export const distilledItems = pgTable(
  "distilled_items",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull(),
    entityId: uuid("entity_id"),
    isGlobal: boolean("is_global").notNull().default(false),
    itemType: distilledItemTypeEnum("item_type").notNull(),
    content: text("content").notNull(),
    status: distilledItemStatusEnum("status").notNull().default("pending"),
    correctionText: text("correction_text"),
    embedding: vector("embedding", { dimensions: 1024 }),
    embeddingModel: text("embedding_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("distilled_items_tenant_id_idx").on(table.tenantId),
    index("distilled_items_source_id_idx").on(table.sourceId),
    index("distilled_items_entity_id_idx").on(table.entityId),
    uniqueIndex("distilled_items_tenant_id_id_unique").on(table.tenantId, table.id),
    foreignKey({
      columns: [table.tenantId, table.sourceId],
      foreignColumns: [rawSources.tenantId, rawSources.id],
      name: "distilled_items_tenant_source_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.entityId],
      foreignColumns: [entities.tenantId, entities.id],
      name: "distilled_items_tenant_entity_fk"
    }).onDelete("set null")
  ]
);

export type RawSourceRow = typeof rawSources.$inferSelect;
export type NewRawSourceRow = typeof rawSources.$inferInsert;
export type DistilledItemRow = typeof distilledItems.$inferSelect;
export type NewDistilledItemRow = typeof distilledItems.$inferInsert;
