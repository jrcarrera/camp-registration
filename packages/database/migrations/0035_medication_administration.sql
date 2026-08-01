CREATE TABLE camper_medication_orders (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  family_id uuid NOT NULL,
  camper_id uuid NOT NULL,
  session_id uuid NOT NULL,
  schedule_type text NOT NULL CHECK (schedule_type IN ('SCHEDULED', 'PRN')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISCONTINUED')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  encrypted_payload bytea NOT NULL CHECK (octet_length(encrypted_payload) > 0),
  encryption_nonce bytea NOT NULL CHECK (octet_length(encryption_nonce) = 12),
  authentication_tag bytea NOT NULL CHECK (octet_length(authentication_tag) = 16),
  key_version integer NOT NULL CHECK (key_version > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  discontinued_by text NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  discontinued_at timestamptz NULL,
  CONSTRAINT camper_medication_orders_camper_fk
    FOREIGN KEY (organization_id, family_id, camper_id)
    REFERENCES campers (organization_id, family_id, id),
  CONSTRAINT camper_medication_orders_session_fk
    FOREIGN KEY (organization_id, session_id)
    REFERENCES sessions (organization_id, id),
  CONSTRAINT camper_medication_orders_date_range CHECK (ends_on >= starts_on),
  CONSTRAINT camper_medication_orders_status_valid CHECK (
    (status = 'ACTIVE' AND discontinued_at IS NULL AND discontinued_by IS NULL)
    OR (
      status = 'DISCONTINUED'
      AND discontinued_at IS NOT NULL
      AND discontinued_by IS NOT NULL
    )
  ),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, id, camper_id)
);

CREATE TABLE camper_medication_administrations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  order_id uuid NOT NULL,
  camper_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('GIVEN', 'REFUSED', 'HELD', 'MISSED')),
  scheduled_for timestamptz NULL,
  administered_at timestamptz NOT NULL,
  encrypted_payload bytea NOT NULL CHECK (octet_length(encrypted_payload) > 0),
  encryption_nonce bytea NOT NULL CHECK (octet_length(encryption_nonce) = 12),
  authentication_tag bytea NOT NULL CHECK (octet_length(authentication_tag) = 16),
  key_version integer NOT NULL CHECK (key_version > 0),
  administered_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT camper_medication_administrations_order_fk
    FOREIGN KEY (organization_id, order_id, camper_id)
    REFERENCES camper_medication_orders (organization_id, id, camper_id),
  UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX camper_medication_administrations_scheduled_unique
  ON camper_medication_administrations (organization_id, order_id, scheduled_for)
  WHERE scheduled_for IS NOT NULL;

CREATE INDEX camper_medication_orders_rounds_idx
  ON camper_medication_orders (
    organization_id, status, session_id, starts_on, ends_on, id
  );
CREATE INDEX camper_medication_administrations_rounds_idx
  ON camper_medication_administrations (
    organization_id, administered_at DESC, id
  );

ALTER TABLE camper_medication_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE camper_medication_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE camper_medication_administrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE camper_medication_administrations FORCE ROW LEVEL SECURITY;

CREATE POLICY camper_medication_orders_tenant_all ON camper_medication_orders
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY camper_medication_administrations_tenant_all
  ON camper_medication_administrations
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON camper_medication_orders, camper_medication_administrations FROM camp_app;
GRANT SELECT, INSERT ON camper_medication_orders, camper_medication_administrations TO camp_app;
GRANT UPDATE (
  status, version, discontinued_by, discontinued_at, updated_at
) ON camper_medication_orders TO camp_app;

COMMENT ON TABLE camper_medication_orders IS
  'Restricted medication orders with application-encrypted medication, dose, instructions, and administration times.';
COMMENT ON TABLE camper_medication_administrations IS
  'Append-only application-encrypted medication administration and exception records.';
COMMENT ON COLUMN camper_medication_orders.encrypted_payload IS
  'AES-256-GCM ciphertext; medication name, dose, instructions, and administration times must never be plaintext columns.';
COMMENT ON COLUMN camper_medication_administrations.encrypted_payload IS
  'AES-256-GCM ciphertext; administration notes must never be a plaintext column.';
