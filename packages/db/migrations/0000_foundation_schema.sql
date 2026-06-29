CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TYPE tenant_status AS ENUM ('active', 'dormant');
CREATE TYPE account_lifecycle_stage AS ENUM ('prospect', 'client', 'former_client');
CREATE TYPE deal_stage AS ENUM ('new', 'qualified', 'proposal', 'won', 'lost');
CREATE TYPE interaction_kind AS ENUM ('email', 'meeting', 'call', 'note', 'task', 'other');

CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  name text NOT NULL,
  status tenant_status NOT NULL DEFAULT 'active',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tenants_slug_unique ON tenants (slug);

CREATE TABLE entities (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  lifecycle_stage account_lifecycle_stage NOT NULL DEFAULT 'prospect',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contacts_tenant_id_idx ON contacts (tenant_id);
CREATE INDEX contacts_account_id_idx ON contacts (account_id);

CREATE TABLE deals (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
  name text NOT NULL,
  stage deal_stage NOT NULL DEFAULT 'new',
  value_cents integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX deals_tenant_id_idx ON deals (tenant_id);
CREATE INDEX deals_account_id_idx ON deals (account_id);

CREATE TABLE interactions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts (id) ON DELETE SET NULL,
  kind interaction_kind NOT NULL,
  occurred_at timestamptz NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX interactions_tenant_id_idx ON interactions (tenant_id);
CREATE INDEX interactions_account_id_idx ON interactions (account_id);
CREATE INDEX interactions_contact_id_idx ON interactions (contact_id);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  session_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX sessions_tenant_id_idx ON sessions (tenant_id);
CREATE INDEX sessions_session_hash_idx ON sessions (session_hash);

CREATE TABLE tenant_totp_secrets (
  tenant_id uuid PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  nonce text NOT NULL,
  key_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recovery_codes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);

CREATE INDEX recovery_codes_tenant_id_idx ON recovery_codes (tenant_id);
CREATE UNIQUE INDEX recovery_codes_tenant_code_hash_unique ON recovery_codes (tenant_id, code_hash);

CREATE TABLE totp_replay_guards (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  time_step bigint NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX totp_replay_guards_tenant_id_idx ON totp_replay_guards (tenant_id);
CREATE UNIQUE INDEX totp_replay_guards_tenant_code_step_unique
  ON totp_replay_guards (tenant_id, code_hash, time_step);
