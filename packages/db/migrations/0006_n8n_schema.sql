CREATE TABLE tenant_n8n_skills (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  n8n_workflow_id text NOT NULL,
  skill_name text NOT NULL,
  webhook_url text NOT NULL,
  webhook_auth_header text,
  webhook_auth_ciphertext text,
  webhook_auth_nonce text,
  webhook_auth_key_id text,
  input_schema jsonb NOT NULL DEFAULT '{"type":"object"}'::jsonb,
  default_rung trust_rung NOT NULL DEFAULT 'act-and-log',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tenant_n8n_skills_tenant_skill_unique
  ON tenant_n8n_skills (tenant_id, skill_name);

CREATE INDEX tenant_n8n_skills_tenant_workflow_idx
  ON tenant_n8n_skills (tenant_id, n8n_workflow_id);

CREATE TABLE n8n_execution_acknowledgments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  n8n_execution_id text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX n8n_execution_acknowledgments_tenant_execution_unique
  ON n8n_execution_acknowledgments (tenant_id, n8n_execution_id);
