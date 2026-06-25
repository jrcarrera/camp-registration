ALTER TABLE campers
  ADD CONSTRAINT campers_organization_family_id_unique UNIQUE (organization_id, family_id, id);

CREATE TABLE registrations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  session_id uuid NOT NULL,
  family_id uuid NOT NULL,
  camper_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('CONFIRMED', 'WAITLISTED', 'CANCELLED')),
  registered_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT registrations_session_fk
    FOREIGN KEY (organization_id, session_id) REFERENCES sessions (organization_id, id),
  CONSTRAINT registrations_camper_fk
    FOREIGN KEY (organization_id, family_id, camper_id) REFERENCES campers (organization_id, family_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, session_id, camper_id)
);

CREATE INDEX registrations_session_status_idx
  ON registrations (organization_id, session_id, status, registered_at, id);

CREATE INDEX registrations_camper_status_idx
  ON registrations (organization_id, family_id, camper_id, status, registered_at, id);

ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations FORCE ROW LEVEL SECURITY;

CREATE POLICY registrations_tenant_select ON registrations
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON registrations FROM camp_app;
GRANT SELECT ON registrations TO camp_app;
