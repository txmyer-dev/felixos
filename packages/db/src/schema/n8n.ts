import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { trustRungEnum } from "./agent.js";
import { tenants } from "./tenants.js";

export const tenantN8nSkills = pgTable(
  "tenant_n8n_skills",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    n8nWorkflowId: text("n8n_workflow_id").notNull(),
    skillName: text("skill_name").notNull(),
    webhookUrl: text("webhook_url").notNull(),
    webhookAuthHeader: text("webhook_auth_header"),
    webhookAuthCiphertext: text("webhook_auth_ciphertext"),
    webhookAuthNonce: text("webhook_auth_nonce"),
    webhookAuthKeyId: text("webhook_auth_key_id"),
    inputSchema: jsonb("input_schema")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({ type: "object" }),
    defaultRung: trustRungEnum("default_rung").notNull().default("act-and-log"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("tenant_n8n_skills_tenant_skill_unique").on(table.tenantId, table.skillName),
    index("tenant_n8n_skills_tenant_workflow_idx").on(table.tenantId, table.n8nWorkflowId)
  ]
);

export const n8nExecutionAcknowledgments = pgTable(
  "n8n_execution_acknowledgments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    n8nExecutionId: text("n8n_execution_id").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("n8n_execution_acknowledgments_tenant_execution_unique").on(
      table.tenantId,
      table.n8nExecutionId
    )
  ]
);

export type TenantN8nSkillRow = typeof tenantN8nSkills.$inferSelect;
export type NewTenantN8nSkillRow = typeof tenantN8nSkills.$inferInsert;
export type N8nExecutionAcknowledgmentRow = typeof n8nExecutionAcknowledgments.$inferSelect;
export type NewN8nExecutionAcknowledgmentRow = typeof n8nExecutionAcknowledgments.$inferInsert;
