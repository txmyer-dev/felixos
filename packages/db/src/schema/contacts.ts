import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { entities } from "./entities.js";
import { tenants } from "./tenants.js";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    role: text("role"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("contacts_tenant_id_idx").on(table.tenantId),
    index("contacts_account_id_idx").on(table.accountId)
  ]
);

export type ContactRow = typeof contacts.$inferSelect;
export type NewContactRow = typeof contacts.$inferInsert;
