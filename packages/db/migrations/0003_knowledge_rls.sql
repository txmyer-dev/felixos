DO $$
DECLARE
  schema_name text := current_schema();
BEGIN
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON raw_sources, distilled_items TO felixos_app_role, felixos_privileged_role'
  );
  EXECUTE format(
    'GRANT USAGE ON TYPE %I.knowledge_source_type, %I.distilled_item_type, %I.distilled_item_status TO felixos_app_role, felixos_privileged_role',
    schema_name,
    schema_name,
    schema_name
  );
END
$$;

ALTER TABLE raw_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_sources FORCE ROW LEVEL SECURITY;

CREATE POLICY raw_sources_tenant_isolation ON raw_sources
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE distilled_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE distilled_items FORCE ROW LEVEL SECURITY;

CREATE POLICY distilled_items_tenant_isolation ON distilled_items
  USING (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant', true), '')::uuid);
