CREATE TYPE inference_provider AS ENUM ('openai', 'openrouter', 'freellmapi');
CREATE TYPE trust_rung AS ENUM ('suggest', 'draft-and-wait', 'act-and-log', 'full-auto');
CREATE TYPE pending_action_status AS ENUM ('pending', 'approved', 'rejected', 'executed', 'failed');

CREATE TABLE tenant_inference_configs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  provider inference_provider NOT NULL,
  base_url text,
  api_key_ciphertext text NOT NULL,
  api_key_nonce text NOT NULL,
  api_key_key_id text NOT NULL,
  distillation_model text NOT NULL,
  embedding_model text NOT NULL,
  supports_tools boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tenant_inference_configs_tenant_id_unique
  ON tenant_inference_configs (tenant_id);

CREATE TABLE tenant_skill_rungs (
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  rung trust_rung NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, skill_name)
);

CREATE TABLE pending_actions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status pending_action_status NOT NULL DEFAULT 'pending',
  agent_context text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pending_actions_tenant_id_status_idx
  ON pending_actions (tenant_id, status);
