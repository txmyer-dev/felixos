import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { tenants } from "./tenants.js";

export const inferenceProviderEnum = pgEnum("inference_provider", [
  "openai",
  "openrouter",
  "freellmapi"
]);

export const trustRungEnum = pgEnum("trust_rung", [
  "suggest",
  "draft-and-wait",
  "act-and-log",
  "full-auto"
]);

export const pendingActionStatusEnum = pgEnum("pending_action_status", [
  "pending",
  "approved",
  "rejected",
  "executed",
  "failed"
]);

export const tenantInferenceConfigs = pgTable(
  "tenant_inference_configs",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: inferenceProviderEnum("provider").notNull(),
    baseUrl: text("base_url"),
    apiKeyCiphertext: text("api_key_ciphertext").notNull(),
    apiKeyNonce: text("api_key_nonce").notNull(),
    apiKeyKeyId: text("api_key_key_id").notNull(),
    distillationModel: text("distillation_model").notNull(),
    embeddingModel: text("embedding_model").notNull(),
    supportsTools: boolean("supports_tools").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [uniqueIndex("tenant_inference_configs_tenant_id_unique").on(table.tenantId)]
);

export const tenantSkillRungs = pgTable(
  "tenant_skill_rungs",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    skillName: text("skill_name").notNull(),
    rung: trustRungEnum("rung").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.skillName] })]
);

export const pendingActions = pgTable(
  "pending_actions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    skillName: text("skill_name").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: pendingActionStatusEnum("status").notNull().default("pending"),
    agentContext: text("agent_context"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("pending_actions_tenant_id_status_idx").on(table.tenantId, table.status)]
);

export type TenantInferenceConfigRow = typeof tenantInferenceConfigs.$inferSelect;
export type NewTenantInferenceConfigRow = typeof tenantInferenceConfigs.$inferInsert;
export type TenantSkillRungRow = typeof tenantSkillRungs.$inferSelect;
export type NewTenantSkillRungRow = typeof tenantSkillRungs.$inferInsert;
export type PendingActionRow = typeof pendingActions.$inferSelect;
export type NewPendingActionRow = typeof pendingActions.$inferInsert;
