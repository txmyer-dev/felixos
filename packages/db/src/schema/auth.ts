import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { tenants } from "./tenants.js";

export const tenantTotpSecrets = pgTable("tenant_totp_secrets", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  ciphertext: text("ciphertext").notNull(),
  nonce: text("nonce").notNull(),
  keyId: text("key_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const recoveryCodes = pgTable(
  "recovery_codes",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true })
  },
  (table) => [
    index("recovery_codes_tenant_id_idx").on(table.tenantId),
    uniqueIndex("recovery_codes_tenant_code_hash_unique").on(table.tenantId, table.codeHash)
  ]
);

export const totpReplayGuards = pgTable(
  "totp_replay_guards",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    timeStep: bigint("time_step", { mode: "number" }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("totp_replay_guards_tenant_id_idx").on(table.tenantId),
    uniqueIndex("totp_replay_guards_tenant_code_step_unique").on(
      table.tenantId,
      table.codeHash,
      table.timeStep
    )
  ]
);

export type TenantTotpSecretRow = typeof tenantTotpSecrets.$inferSelect;
export type NewTenantTotpSecretRow = typeof tenantTotpSecrets.$inferInsert;
export type RecoveryCodeRow = typeof recoveryCodes.$inferSelect;
export type NewRecoveryCodeRow = typeof recoveryCodes.$inferInsert;
export type TotpReplayGuardRow = typeof totpReplayGuards.$inferSelect;
export type NewTotpReplayGuardRow = typeof totpReplayGuards.$inferInsert;
