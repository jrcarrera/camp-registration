ALTER TABLE registrations
  ADD COLUMN waitlist_position_at timestamptz NULL;

UPDATE registrations
SET waitlist_position_at = registered_at;

ALTER TABLE registrations
  ALTER COLUMN waitlist_position_at SET NOT NULL,
  ALTER COLUMN waitlist_position_at SET DEFAULT transaction_timestamp();

CREATE INDEX registrations_waitlist_position_idx
  ON registrations (organization_id, session_id, waitlist_position_at, id)
  WHERE status = 'WAITLISTED';

GRANT UPDATE (
  waitlist_position_at
) ON registrations TO camp_app;

ALTER TABLE waitlist_offers
  ADD COLUMN resend_count integer NOT NULL DEFAULT 0 CHECK (resend_count >= 0);

GRANT UPDATE (
  resend_count
) ON waitlist_offers TO camp_app;

CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  family_id uuid NOT NULL,
  session_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  waitlist_offer_id uuid NOT NULL,
  notification_type text NOT NULL CHECK (
    notification_type IN (
      'WAITLIST_OFFERED',
      'WAITLIST_EXPIRING_SOON',
      'WAITLIST_ACCEPTED',
      'WAITLIST_DECLINED',
      'WAITLIST_EXPIRED',
      'WAITLIST_CANCELLED'
    )
  ),
  recipient_email text NOT NULL,
  template_data jsonb NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED')
  ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  locked_at timestamptz NULL,
  locked_by text NULL,
  delivered_at timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT notification_outbox_offer_fk
    FOREIGN KEY (organization_id, waitlist_offer_id)
    REFERENCES waitlist_offers (organization_id, id),
  CONSTRAINT notification_outbox_registration_fk
    FOREIGN KEY (organization_id, family_id, session_id, registration_id)
    REFERENCES registrations (organization_id, family_id, session_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX notification_outbox_delivery_idx
  ON notification_outbox (organization_id, status, available_at, created_at, id);

CREATE INDEX notification_outbox_offer_idx
  ON notification_outbox (
    organization_id,
    waitlist_offer_id,
    notification_type,
    recipient_email
  );

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_outbox_tenant_select ON notification_outbox
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY notification_outbox_tenant_insert ON notification_outbox
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY notification_outbox_tenant_update ON notification_outbox
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT SELECT ON notification_outbox TO camp_app;

GRANT INSERT (
  id,
  organization_id,
  family_id,
  session_id,
  registration_id,
  waitlist_offer_id,
  notification_type,
  recipient_email,
  template_data,
  idempotency_key
) ON notification_outbox TO camp_app;

GRANT UPDATE (
  status,
  attempt_count,
  available_at,
  locked_at,
  locked_by,
  delivered_at,
  last_error,
  updated_at
) ON notification_outbox TO camp_app;
