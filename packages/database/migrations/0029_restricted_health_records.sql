CREATE TABLE camper_health_records (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  family_id uuid NOT NULL,
  camper_id uuid NOT NULL,
  encrypted_payload bytea NOT NULL CHECK (octet_length(encrypted_payload) > 0),
  encryption_nonce bytea NOT NULL CHECK (octet_length(encryption_nonce) = 12),
  authentication_tag bytea NOT NULL CHECK (octet_length(authentication_tag) = 16),
  key_version integer NOT NULL CHECK (key_version > 0),
  review_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (review_status IN ('DRAFT', 'SUBMITTED', 'NEEDS_CHANGES', 'APPROVED')),
  immunization_status text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (immunization_status IN ('UNKNOWN', 'CURRENT', 'INCOMPLETE', 'EXEMPT')),
  has_allergies boolean NOT NULL DEFAULT false,
  has_medications boolean NOT NULL DEFAULT false,
  has_dietary_needs boolean NOT NULL DEFAULT false,
  has_accessibility_needs boolean NOT NULL DEFAULT false,
  has_emergency_instructions boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NULL,
  reviewed_at timestamptz NULL,
  reviewed_by text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT camper_health_records_camper_fk
    FOREIGN KEY (organization_id, family_id, camper_id)
    REFERENCES campers (organization_id, family_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, camper_id)
);

CREATE INDEX camper_health_records_review_idx
  ON camper_health_records (organization_id, review_status, updated_at DESC, id);

ALTER TABLE camper_health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE camper_health_records FORCE ROW LEVEL SECURITY;

CREATE POLICY camper_health_records_tenant_all ON camper_health_records
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON camper_health_records FROM camp_app;
GRANT SELECT, INSERT ON camper_health_records TO camp_app;
GRANT UPDATE (
  encrypted_payload, encryption_nonce, authentication_tag, key_version,
  review_status, immunization_status, has_allergies, has_medications,
  has_dietary_needs, has_accessibility_needs, has_emergency_instructions,
  submitted_at, reviewed_at, reviewed_by, version, updated_by, updated_at
) ON camper_health_records TO camp_app;

COMMENT ON TABLE camper_health_records IS
  'Restricted: application-encrypted camper health payloads plus minimum operational projections.';
COMMENT ON COLUMN camper_health_records.encrypted_payload IS
  'AES-256-GCM ciphertext; plaintext must never be persisted or logged.';
