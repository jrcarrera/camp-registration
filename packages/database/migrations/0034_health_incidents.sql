CREATE TABLE camper_health_incidents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  family_id uuid NOT NULL,
  camper_id uuid NOT NULL,
  session_id uuid NOT NULL,
  incident_type text NOT NULL
    CHECK (incident_type IN ('INJURY', 'ILLNESS', 'SAFETY', 'BEHAVIORAL', 'OTHER')),
  severity text NOT NULL CHECK (severity IN ('MINOR', 'MODERATE', 'SERIOUS')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  occurred_at timestamptz NOT NULL,
  guardian_notification_status text NOT NULL
    CHECK (guardian_notification_status IN ('NOT_REQUIRED', 'PENDING', 'NOTIFIED')),
  encrypted_payload bytea NOT NULL CHECK (octet_length(encrypted_payload) > 0),
  encryption_nonce bytea NOT NULL CHECK (octet_length(encryption_nonce) = 12),
  authentication_tag bytea NOT NULL CHECK (octet_length(authentication_tag) = 16),
  key_version integer NOT NULL CHECK (key_version > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  resolved_by text NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  resolved_at timestamptz NULL,
  CONSTRAINT camper_health_incidents_camper_fk
    FOREIGN KEY (organization_id, family_id, camper_id)
    REFERENCES campers (organization_id, family_id, id),
  CONSTRAINT camper_health_incidents_session_fk
    FOREIGN KEY (organization_id, session_id)
    REFERENCES sessions (organization_id, id),
  CONSTRAINT camper_health_incidents_resolution_valid CHECK (
    (status = 'OPEN' AND resolved_at IS NULL AND resolved_by IS NULL)
    OR (status = 'RESOLVED' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
  ),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, id, camper_id)
);

CREATE TABLE camper_health_incident_entries (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  incident_id uuid NOT NULL,
  camper_id uuid NOT NULL,
  entry_type text NOT NULL
    CHECK (entry_type IN ('FOLLOW_UP', 'GUARDIAN_NOTIFICATION', 'RESOLUTION')),
  encrypted_payload bytea NOT NULL CHECK (octet_length(encrypted_payload) > 0),
  encryption_nonce bytea NOT NULL CHECK (octet_length(encryption_nonce) = 12),
  authentication_tag bytea NOT NULL CHECK (octet_length(authentication_tag) = 16),
  key_version integer NOT NULL CHECK (key_version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT camper_health_incident_entries_incident_fk
    FOREIGN KEY (organization_id, incident_id, camper_id)
    REFERENCES camper_health_incidents (organization_id, id, camper_id),
  UNIQUE (organization_id, id)
);

CREATE INDEX camper_health_incidents_center_idx
  ON camper_health_incidents (organization_id, status, occurred_at DESC, id);
CREATE INDEX camper_health_incidents_session_idx
  ON camper_health_incidents (organization_id, session_id, occurred_at DESC, id);
CREATE INDEX camper_health_incident_entries_timeline_idx
  ON camper_health_incident_entries (organization_id, incident_id, created_at, id);

ALTER TABLE camper_health_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE camper_health_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE camper_health_incident_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE camper_health_incident_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY camper_health_incidents_tenant_all ON camper_health_incidents
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY camper_health_incident_entries_tenant_all ON camper_health_incident_entries
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON camper_health_incidents, camper_health_incident_entries FROM camp_app;
GRANT SELECT, INSERT ON camper_health_incidents, camper_health_incident_entries TO camp_app;
GRANT UPDATE (
  status, guardian_notification_status, version, resolved_by, resolved_at, updated_at
) ON camper_health_incidents TO camp_app;

COMMENT ON TABLE camper_health_incidents IS
  'Restricted incident headers with application-encrypted clinical and narrative details.';
COMMENT ON TABLE camper_health_incident_entries IS
  'Append-only application-encrypted follow-up and resolution notes for health incidents.';
COMMENT ON COLUMN camper_health_incidents.encrypted_payload IS
  'AES-256-GCM ciphertext; location, summary, care, and guardian details must never be plaintext columns.';
