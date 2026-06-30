export const currentTenantSetting = "app.current_tenant";

export const appRoleName = "felixos_app_role";
export const privilegedRoleName = "felixos_privileged_role";

export const tenantScopedTables = [
  "tenants",
  "entities",
  "contacts",
  "deals",
  "interactions",
  "sessions",
  "tenant_totp_secrets",
  "recovery_codes",
  "totp_replay_guards",
  "raw_sources",
  "distilled_items",
  "tenant_inference_configs",
  "tenant_skill_rungs",
  "pending_actions"
] as const;

export type TenantScopedTable = (typeof tenantScopedTables)[number];
