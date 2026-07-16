CREATE VIEW waitlist_notification_recipients
WITH (security_invoker = true)
AS
SELECT
  adults.organization_id,
  adults.family_id,
  adults.id AS recipient_id,
  adults.email AS recipient_email
FROM adults
WHERE adults.archived_at IS NULL
  AND adults.email IS NOT NULL
  AND adults.receives_operational_communication
  AND (adults.account_owner OR adults.can_register);

GRANT SELECT ON waitlist_notification_recipients TO camp_app;

CREATE TABLE notification_coverage_issues (
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
  template_data jsonb NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  replay_count integer NOT NULL DEFAULT 0 CHECK (replay_count >= 0),
  first_observed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_observed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  resolved_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT notification_coverage_issues_offer_fk
    FOREIGN KEY (organization_id, waitlist_offer_id)
    REFERENCES waitlist_offers (organization_id, id),
  CONSTRAINT notification_coverage_issues_registration_fk
    FOREIGN KEY (organization_id, family_id, session_id, registration_id)
    REFERENCES registrations (organization_id, family_id, session_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX notification_coverage_issues_open_idx
  ON notification_coverage_issues (organization_id, status, last_observed_at DESC, id);

ALTER TABLE notification_coverage_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_coverage_issues FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_coverage_issues_tenant_select ON notification_coverage_issues
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY notification_coverage_issues_tenant_insert ON notification_coverage_issues
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY notification_coverage_issues_tenant_update ON notification_coverage_issues
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON notification_coverage_issues FROM camp_app;
GRANT SELECT ON notification_coverage_issues TO camp_app;
GRANT INSERT (
  id,
  organization_id,
  family_id,
  session_id,
  registration_id,
  waitlist_offer_id,
  notification_type,
  template_data,
  idempotency_key
) ON notification_coverage_issues TO camp_app;
GRANT UPDATE (
  status,
  replay_count,
  last_observed_at,
  resolved_at,
  updated_at
) ON notification_coverage_issues TO camp_app;
