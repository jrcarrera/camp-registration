ALTER TABLE organizations
  ADD COLUMN stripe_connected_account_id text NULL,
  ADD CONSTRAINT organizations_stripe_connected_account_valid CHECK (
    stripe_connected_account_id IS NULL
    OR stripe_connected_account_id ~ '^acct_[A-Za-z0-9]+$'
  );

CREATE UNIQUE INDEX organizations_stripe_connected_account_idx
  ON organizations (stripe_connected_account_id)
  WHERE stripe_connected_account_id IS NOT NULL;

GRANT UPDATE (stripe_connected_account_id, updated_at) ON organizations TO camp_app;

CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  family_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('STRIPE', 'LOCAL')),
  provider_account_id text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL CHECK (currency = 'USD'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED')
  ),
  idempotency_key uuid NOT NULL,
  provider_checkout_session_id text NULL,
  provider_payment_intent_id text NULL,
  checkout_url text NULL,
  receipt_url text NULL,
  failure_code text NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  completed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT payment_attempts_registration_fk
    FOREIGN KEY (organization_id, family_id, registration_id)
    REFERENCES registrations (organization_id, family_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key)
);

CREATE UNIQUE INDEX payment_attempts_provider_session_idx
  ON payment_attempts (provider, provider_account_id, provider_checkout_session_id)
  WHERE provider_checkout_session_id IS NOT NULL;

CREATE INDEX payment_attempts_reconciliation_idx
  ON payment_attempts (organization_id, status, created_at DESC, id DESC);

ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_attempts_tenant_select ON payment_attempts
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY payment_attempts_tenant_insert ON payment_attempts
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY payment_attempts_tenant_update ON payment_attempts
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON payment_attempts FROM camp_app;
GRANT SELECT ON payment_attempts TO camp_app;
GRANT INSERT (
  id,
  organization_id,
  family_id,
  registration_id,
  provider,
  provider_account_id,
  amount_cents,
  currency,
  idempotency_key,
  created_by
) ON payment_attempts TO camp_app;
GRANT UPDATE (
  status,
  provider_checkout_session_id,
  provider_payment_intent_id,
  checkout_url,
  receipt_url,
  failure_code,
  completed_at,
  updated_at
) ON payment_attempts TO camp_app;

CREATE TABLE payment_webhook_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  payment_attempt_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('STRIPE', 'LOCAL')),
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  outcome text NOT NULL DEFAULT 'RECEIVED' CHECK (
    outcome IN ('RECEIVED', 'APPLIED', 'IGNORED', 'REJECTED')
  ),
  received_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  processed_at timestamptz NULL,
  CONSTRAINT payment_webhook_events_attempt_fk
    FOREIGN KEY (organization_id, payment_attempt_id)
    REFERENCES payment_attempts (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (provider, provider_event_id)
);

ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhook_events FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_webhook_events_tenant_select ON payment_webhook_events
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY payment_webhook_events_tenant_insert ON payment_webhook_events
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY payment_webhook_events_tenant_update ON payment_webhook_events
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON payment_webhook_events FROM camp_app;
GRANT SELECT ON payment_webhook_events TO camp_app;
GRANT INSERT (
  id,
  organization_id,
  payment_attempt_id,
  provider,
  provider_event_id,
  event_type
) ON payment_webhook_events TO camp_app;
GRANT UPDATE (outcome, processed_at) ON payment_webhook_events TO camp_app;

ALTER TABLE registration_payments
  DROP CONSTRAINT registration_payments_method_check,
  ADD COLUMN payment_attempt_id uuid NULL,
  ADD COLUMN provider text NULL,
  ADD COLUMN provider_reference text NULL,
  ADD COLUMN receipt_url text NULL,
  ADD CONSTRAINT registration_payments_method_check CHECK (
    method IN (
      'OFFLINE_CASH',
      'OFFLINE_CHECK',
      'OFFLINE_CARD',
      'ONLINE_CARD',
      'SCHOLARSHIP',
      'DISCOUNT',
      'OTHER'
    )
  ),
  ADD CONSTRAINT registration_payments_attempt_fk
    FOREIGN KEY (organization_id, payment_attempt_id)
    REFERENCES payment_attempts (organization_id, id),
  ADD CONSTRAINT registration_payments_provider_consistent CHECK (
    (payment_attempt_id IS NULL AND provider IS NULL)
    OR (payment_attempt_id IS NOT NULL AND provider IS NOT NULL)
  );

CREATE UNIQUE INDEX registration_payments_attempt_idx
  ON registration_payments (organization_id, payment_attempt_id)
  WHERE payment_attempt_id IS NOT NULL;

GRANT INSERT (
  payment_attempt_id,
  provider,
  provider_reference,
  receipt_url
) ON registration_payments TO camp_app;

ALTER TABLE notification_outbox
  DROP CONSTRAINT notification_outbox_notification_type_check,
  ALTER COLUMN waitlist_offer_id DROP NOT NULL,
  ADD CONSTRAINT notification_outbox_notification_type_check CHECK (
    notification_type IN (
      'WAITLIST_OFFERED',
      'WAITLIST_EXPIRING_SOON',
      'WAITLIST_ACCEPTED',
      'WAITLIST_DECLINED',
      'WAITLIST_EXPIRED',
      'WAITLIST_CANCELLED',
      'PAYMENT_RECEIPT'
    )
  );
