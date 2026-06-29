import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { contacts } from "./contacts.js";
import { entities } from "./entities.js";
import { tenants } from "./tenants.js";

export const interactionKindEnum = pgEnum("interaction_kind", [
  "email",
  "meeting",
  "call",
  "note",
  "task",
  "other"
]);

export const interactions = pgTable(
  "interactions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    kind: interactionKindEnum("kind").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("interactions_tenant_id_idx").on(table.tenantId),
    index("interactions_account_id_idx").on(table.accountId),
    index("interactions_contact_id_idx").on(table.contactId)
  ]
);

export type InteractionRow = typeof interactions.$inferSelect;
export type NewInteractionRow = typeof interactions.$inferInsert;
