import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { entities } from "./entities.js";
import { tenants } from "./tenants.js";

export const dealStageEnum = pgEnum("deal_stage", ["new", "qualified", "proposal", "won", "lost"]);

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    stage: dealStageEnum("stage").notNull().default("new"),
    valueCents: integer("value_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("deals_tenant_id_idx").on(table.tenantId),
    index("deals_account_id_idx").on(table.accountId)
  ]
);

export type DealRow = typeof deals.$inferSelect;
export type NewDealRow = typeof deals.$inferInsert;
