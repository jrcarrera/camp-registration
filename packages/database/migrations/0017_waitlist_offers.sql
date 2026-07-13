ALTER TABLE registrations
  DROP CONSTRAINT registrations_organization_id_session_id_camper_id_key;

CREATE UNIQUE INDEX registrations_one_active_session_camper_idx
  ON registrations (organization_id, session_id, camper_id)
  WHERE status IN ('CONFIRMED', 'WAITLISTED');

ALTER TABLE registrations
  ADD CONSTRAINT registrations_organization_family_session_id_unique
  UNIQUE (organization_id, family_id, session_id, id);

CREATE TABLE waitlist_offers (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  session_id uuid NOT NULL,
  family_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  status text NOT NULL CHECK (
    status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED')
  ),
  offered_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz NULL,
  created_by text NOT NULL,
  response_actor_id text NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT waitlist_offers_expiry_valid CHECK (expires_at > offered_at),
  CONSTRAINT waitlist_offers_response_valid CHECK (
    (status = 'PENDING' AND responded_at IS NULL AND response_actor_id IS NULL)
    OR (status <> 'PENDING' AND responded_at IS NOT NULL AND response_actor_id IS NOT NULL)
  ),
  CONSTRAINT waitlist_offers_session_fk
    FOREIGN KEY (organization_id, session_id)
    REFERENCES sessions (organization_id, id),
  CONSTRAINT waitlist_offers_registration_fk
    FOREIGN KEY (organization_id, family_id, session_id, registration_id)
    REFERENCES registrations (organization_id, family_id, session_id, id),
  UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX waitlist_offers_one_pending_registration_idx
  ON waitlist_offers (organization_id, registration_id)
  WHERE status = 'PENDING';

CREATE INDEX waitlist_offers_session_active_idx
  ON waitlist_offers (organization_id, session_id, status, expires_at, offered_at, id);

CREATE INDEX waitlist_offers_family_idx
  ON waitlist_offers (organization_id, family_id, offered_at DESC, id DESC);

ALTER TABLE waitlist_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_offers FORCE ROW LEVEL SECURITY;

CREATE POLICY waitlist_offers_tenant_select ON waitlist_offers
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY waitlist_offers_tenant_insert ON waitlist_offers
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY waitlist_offers_tenant_update ON waitlist_offers
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT SELECT ON waitlist_offers TO camp_app;

GRANT INSERT (
  id,
  organization_id,
  session_id,
  family_id,
  registration_id,
  status,
  expires_at,
  created_by
) ON waitlist_offers TO camp_app;

GRANT UPDATE (
  status,
  responded_at,
  response_actor_id,
  updated_at
) ON waitlist_offers TO camp_app;
