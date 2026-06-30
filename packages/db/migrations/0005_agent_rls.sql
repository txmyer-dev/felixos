DO $$
DECLARE
  schema_name text := current_schema();
BEGIN
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_inference_configs, tenant_skill_rungs, pending_actions TO felixos_app_role, felixos_privileged_role'
  );
  EXECUTE format(
    'GRANT USAGE ON TYPE %I.inference_provider, %I.trust_rung, %I.pending_action_status TO felixos_app_role, felixos_privileged_role',
    schema_name,
    schema_name,
    schema_name
  );
END
$$;

ALTER TABLE tenant_inference_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_inference_configs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_inference_configs_tenant_isolation ON tenant_inference_configs
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE tenant_skill_rungs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_skill_rungs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_skill_rungs_tenant_isolation ON tenant_skill_rungs
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_actions FORCE ROW LEVEL SECURITY;

CREATE POLICY pending_actions_tenant_isolation ON pending_actions
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
