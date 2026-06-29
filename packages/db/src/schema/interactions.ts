import { foreignKey, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
    accountId: uuid("account_id").notNull(),
    contactId: uuid("contact_id"),
    kind: interactionKindEnum("kind").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("interactions_tenant_id_idx").on(table.tenantId),
    index("interactions_account_id_idx").on(table.accountId),
    index("interactions_contact_id_idx").on(table.contactId),
    foreignKey({
      columns: [table.tenantId, table.accountId],
      foreignColumns: [entities.tenantId, entities.id],
      name: "interactions_tenant_account_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.contactId],
      foreignColumns: [contacts.tenantId, contacts.id],
      name: "interactions_tenant_contact_fk"
    }).onDelete("set null")
  ]
);

export type InteractionRow = typeof interactions.$inferSelect;
export type NewInteractionRow = typeof interactions.$inferInsert;
