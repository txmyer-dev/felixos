import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { tenants } from "./tenants.js";

export const accountLifecycleStageEnum = pgEnum("account_lifecycle_stage", [
  "prospect",
  "client",
  "former_client"
]);

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lifecycleStage: accountLifecycleStageEnum("lifecycle_stage").notNull().default("prospect"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [uniqueIndex("entities_tenant_id_id_unique").on(table.tenantId, table.id)]
);

export type EntityRow = typeof entities.$inferSelect;
export type NewEntityRow = typeof entities.$inferInsert;
