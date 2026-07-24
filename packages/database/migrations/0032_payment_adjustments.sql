ALTER TABLE organization_memberships
  DROP CONSTRAINT organization_memberships_roles_check,
  ADD CONSTRAINT organization_memberships_roles_check CHECK (
    cardinality(roles) > 0
    AND roles <@ ARRAY[
      'camp_staff', 'health_staff', 'finance_staff', 'camp_admin', 'organization_admin'
    ]::text[]
  );

ALTER TABLE identity_invitations
  DROP CONSTRAINT identity_invitations_roles_check,
  ADD CONSTRAINT identity_invitations_roles_check CHECK (
    roles <@ ARRAY[
      'camp_staff', 'health_staff', 'finance_staff', 'camp_admin', 'organization_admin'
    ]::text[]
  );

ALTER TABLE registration_payments
  DROP CONSTRAINT registration_payments_amount_cents_check,
  DROP CONSTRAINT registration_payments_method_check,
  ADD CONSTRAINT registration_payments_amount_cents_check CHECK (amount_cents <> 0),
  ADD CONSTRAINT registration_payments_method_check CHECK (
    method IN (
      'OFFLINE_CASH',
      'OFFLINE_CHECK',
      'OFFLINE_CARD',
      'ONLINE_CARD',
      'SCHOLARSHIP',
      'DISCOUNT',
      'ACCOUNT_CREDIT',
      'ADJUSTMENT_CHARGE',
      'OTHER'
    )
  );

ALTER TABLE notification_outbox
  DROP CONSTRAINT notification_outbox_notification_type_check,
  ADD CONSTRAINT notification_outbox_notification_type_check CHECK (
    notification_type IN (
      'WAITLIST_OFFERED', 'WAITLIST_EXPIRING_SOON', 'WAITLIST_ACCEPTED',
      'WAITLIST_DECLINED', 'WAITLIST_EXPIRED', 'WAITLIST_CANCELLED',
      'PAYMENT_RECEIPT', 'PAYMENT_REFUND', 'ORDER_CONFIRMATION',
      'INSTALLMENT_DUE_SOON', 'INSTALLMENT_DUE', 'LIFECYCLE_MESSAGE', 'IDENTITY_MESSAGE'
    )
  );

CREATE TABLE payment_adjustments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  family_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  payment_attempt_id uuid NULL,
  adjustment_type text NOT NULL CHECK (
    adjustment_type IN ('CREDIT', 'CHARGE', 'REFUND')
  ),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 500),
  status text NOT NULL CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED')),
  idempotency_key uuid NOT NULL,
  provider text NULL CHECK (provider IS NULL OR provider IN ('STRIPE', 'LOCAL')),
  provider_account_id text NULL,
  provider_refund_id text NULL,
  failure_code text NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  completed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT payment_adjustments_registration_fk
    FOREIGN KEY (organization_id, family_id, registration_id)
    REFERENCES registrations (organization_id, family_id, id),
  CONSTRAINT payment_adjustments_attempt_fk
    FOREIGN KEY (organization_id, payment_attempt_id)
    REFERENCES payment_attempts (organization_id, id),
  CONSTRAINT payment_adjustments_refund_shape CHECK (
    (
      adjustment_type = 'REFUND'
      AND payment_attempt_id IS NOT NULL
      AND provider IS NOT NULL
      AND provider_account_id IS NOT NULL
    )
    OR (
      adjustment_type IN ('CREDIT', 'CHARGE')
      AND payment_attempt_id IS NULL
      AND provider IS NULL
      AND provider_account_id IS NULL
      AND provider_refund_id IS NULL
      AND status = 'SUCCEEDED'
    )
  ),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX payment_adjustments_registration_idx
  ON payment_adjustments (organization_id, registration_id, created_at DESC, id DESC);

CREATE INDEX payment_adjustments_attempt_idx
  ON payment_adjustments (organization_id, payment_attempt_id, created_at DESC, id DESC)
  WHERE payment_attempt_id IS NOT NULL;

CREATE UNIQUE INDEX payment_adjustments_provider_refund_idx
  ON payment_adjustments (provider, provider_account_id, provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;

CREATE TABLE payment_adjustment_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  payment_adjustment_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('STRIPE', 'LOCAL')),
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('APPLIED', 'IGNORED', 'REJECTED')),
  received_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  processed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT payment_adjustment_events_adjustment_fk
    FOREIGN KEY (organization_id, payment_adjustment_id)
    REFERENCES payment_adjustments (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (provider, provider_event_id)
);

ALTER TABLE payment_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_adjustments FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_adjustment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_adjustment_events FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_adjustments_tenant_all ON payment_adjustments
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY payment_adjustment_events_tenant_all ON payment_adjustment_events
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON payment_adjustments, payment_adjustment_events FROM camp_app;
GRANT SELECT ON payment_adjustments TO camp_app;
GRANT INSERT (
  id,
  organization_id,
  family_id,
  registration_id,
  payment_attempt_id,
  adjustment_type,
  amount_cents,
  reason,
  status,
  idempotency_key,
  provider,
  provider_account_id,
  created_by,
  completed_at
) ON payment_adjustments TO camp_app;
GRANT UPDATE (
  provider_refund_id,
  status,
  failure_code,
  completed_at,
  updated_at
) ON payment_adjustments TO camp_app;
GRANT SELECT, INSERT ON payment_adjustment_events TO camp_app;
