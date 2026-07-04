ALTER TABLE registrations
  ADD COLUMN currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  ADD COLUMN deposit_cents integer NOT NULL DEFAULT 0 CHECK (
    deposit_cents >= 0
    AND deposit_cents <= price_cents
  ),
  ADD CONSTRAINT registrations_currency_valid CHECK (currency = 'USD');

UPDATE registrations r
SET currency = s.currency,
    price_cents = s.price_cents,
    deposit_cents = s.deposit_cents
FROM sessions s
WHERE s.organization_id = r.organization_id
  AND s.id = r.session_id;

ALTER TABLE registrations
  ADD CONSTRAINT registrations_organization_family_id_unique
  UNIQUE (organization_id, family_id, id);

CREATE TABLE registration_payments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  family_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  method text NOT NULL CHECK (
    method IN (
      'OFFLINE_CASH',
      'OFFLINE_CHECK',
      'OFFLINE_CARD',
      'SCHOLARSHIP',
      'DISCOUNT',
      'OTHER'
    )
  ),
  note text NULL,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT registration_payments_registration_fk
    FOREIGN KEY (organization_id, family_id, registration_id)
    REFERENCES registrations (organization_id, family_id, id),
  UNIQUE (organization_id, id)
);

CREATE INDEX registration_payments_registration_idx
  ON registration_payments (organization_id, registration_id, recorded_at, id);

CREATE INDEX registration_payments_family_idx
  ON registration_payments (organization_id, family_id, recorded_at, id);

ALTER TABLE registration_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_payments FORCE ROW LEVEL SECURITY;

CREATE POLICY registration_payments_tenant_select ON registration_payments
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY registration_payments_tenant_insert ON registration_payments
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT INSERT (
  currency,
  price_cents,
  deposit_cents
) ON registrations TO camp_app;

GRANT SELECT ON registration_payments TO camp_app;

GRANT INSERT (
  id,
  organization_id,
  family_id,
  registration_id,
  amount_cents,
  method,
  note,
  recorded_by
) ON registration_payments TO camp_app;
