CREATE TYPE knowledge_source_type AS ENUM ('email', 'slack', 'transcript', 'youtube', 'doc', 'note');
CREATE TYPE distilled_item_type AS ENUM ('fact', 'decision', 'action');
CREATE TYPE distilled_item_status AS ENUM ('pending', 'accepted', 'rejected', 'corrected');

CREATE TABLE raw_sources (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  entity_id uuid,
  source_type knowledge_source_type NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raw_sources_tenant_entity_fk
    FOREIGN KEY (tenant_id, entity_id)
    REFERENCES entities (tenant_id, id)
    ON DELETE SET NULL (entity_id)
);

CREATE INDEX raw_sources_tenant_id_idx ON raw_sources (tenant_id);
CREATE INDEX raw_sources_entity_id_idx ON raw_sources (entity_id);
CREATE UNIQUE INDEX raw_sources_tenant_id_id_unique ON raw_sources (tenant_id, id);

CREATE TABLE distilled_items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  source_id uuid NOT NULL,
  entity_id uuid,
  is_global boolean NOT NULL DEFAULT false,
  item_type distilled_item_type NOT NULL,
  content text NOT NULL,
  status distilled_item_status NOT NULL DEFAULT 'pending',
  correction_text text,
  embedding vector(1024),
  embedding_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distilled_items_embedding_1024_dims
    CHECK (embedding IS NULL OR vector_dims(embedding) = 1024),
  CONSTRAINT distilled_items_tenant_source_fk
    FOREIGN KEY (tenant_id, source_id)
    REFERENCES raw_sources (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT distilled_items_tenant_entity_fk
    FOREIGN KEY (tenant_id, entity_id)
    REFERENCES entities (tenant_id, id)
    ON DELETE SET NULL (entity_id)
);

CREATE INDEX distilled_items_tenant_id_idx ON distilled_items (tenant_id);
CREATE INDEX distilled_items_source_id_idx ON distilled_items (source_id);
CREATE INDEX distilled_items_entity_id_idx ON distilled_items (entity_id);
CREATE UNIQUE INDEX distilled_items_tenant_id_id_unique ON distilled_items (tenant_id, id);
CREATE INDEX distilled_items_embedding_hnsw_idx
  ON distilled_items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
