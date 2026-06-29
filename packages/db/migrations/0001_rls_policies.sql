DO $$
BEGIN
  CREATE ROLE felixos_app_role NOLOGIN NOBYPASSRLS;
EXCEPTION
  WHEN duplicate_object THEN
    ALTER ROLE felixos_app_role NOBYPASSRLS;
END
$$;

DO $$
BEGIN
  CREATE ROLE felixos_privileged_role NOLOGIN BYPASSRLS;
EXCEPTION
  WHEN duplicate_object THEN
    ALTER ROLE felixos_privileged_role BYPASSRLS;
END
$$;

DO $$
DECLARE
  schema_name text := current_schema();
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO felixos_app_role, felixos_privileged_role', schema_name);
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO felixos_app_role, felixos_privileged_role',
    schema_name
  );
END
$$;

CREATE UNIQUE INDEX entities_tenant_id_id_unique ON entities (tenant_id, id);
CREATE UNIQUE INDEX contacts_tenant_id_id_unique ON contacts (tenant_id, id);

ALTER TABLE contacts DROP CONSTRAINT contacts_account_id_fkey;
ALTER TABLE deals DROP CONSTRAINT deals_account_id_fkey;
ALTER TABLE interactions DROP CONSTRAINT interactions_account_id_fkey;
ALTER TABLE interactions DROP CONSTRAINT interactions_contact_id_fkey;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_tenant_account_fk
  FOREIGN KEY (tenant_id, account_id)
  REFERENCES entities (tenant_id, id)
  ON DELETE CASCADE;

ALTER TABLE deals
  ADD CONSTRAINT deals_tenant_account_fk
  FOREIGN KEY (tenant_id, account_id)
  REFERENCES entities (tenant_id, id)
  ON DELETE CASCADE;

ALTER TABLE interactions
  ADD CONSTRAINT interactions_tenant_account_fk
  FOREIGN KEY (tenant_id, account_id)
  REFERENCES entities (tenant_id, id)
  ON DELETE CASCADE;

ALTER TABLE interactions
  ADD CONSTRAINT interactions_tenant_contact_fk
  FOREIGN KEY (tenant_id, contact_id)
  REFERENCES contacts (tenant_id, id)
  ON DELETE SET NULL;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_tenant_isolation ON tenants
  USING (id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities FORCE ROW LEVEL SECURITY;

CREATE POLICY entities_tenant_isolation ON entities
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY contacts_tenant_isolation ON contacts
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals FORCE ROW LEVEL SECURITY;

CREATE POLICY deals_tenant_isolation ON deals
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions FORCE ROW LEVEL SECURITY;

CREATE POLICY interactions_tenant_isolation ON interactions
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY sessions_tenant_isolation ON sessions
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE tenant_totp_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_totp_secrets FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_totp_secrets_tenant_isolation ON tenant_totp_secrets
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_codes FORCE ROW LEVEL SECURITY;

CREATE POLICY recovery_codes_tenant_isolation ON recovery_codes
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE totp_replay_guards ENABLE ROW LEVEL SECURITY;
ALTER TABLE totp_replay_guards FORCE ROW LEVEL SECURITY;

CREATE POLICY totp_replay_guards_tenant_isolation ON totp_replay_guards
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
