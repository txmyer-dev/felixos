GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_n8n_skills, n8n_execution_acknowledgments
  TO felixos_app_role, felixos_privileged_role;

ALTER TABLE tenant_n8n_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_n8n_skills FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_n8n_skills_tenant_isolation ON tenant_n8n_skills
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE n8n_execution_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE n8n_execution_acknowledgments FORCE ROW LEVEL SECURITY;

CREATE POLICY n8n_execution_acknowledgments_tenant_isolation ON n8n_execution_acknowledgments
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
