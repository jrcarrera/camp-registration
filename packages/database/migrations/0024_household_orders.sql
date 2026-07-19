CREATE TABLE household_orders (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  family_id uuid NOT NULL,
  status text NOT NULL CHECK (
    status IN ('PAYMENT_PENDING', 'COMPLETED', 'PARTIAL', 'EXPIRED', 'CANCELLED')
  ),
  waitlist_mode text NOT NULL CHECK (waitlist_mode IN ('INDIVIDUAL', 'KEEP_TOGETHER')),
  currency text NOT NULL CHECK (currency = 'USD'),
  gross_total_cents integer NOT NULL CHECK (gross_total_cents >= 0),
  automatic_discount_cents integer NOT NULL DEFAULT 0 CHECK (automatic_discount_cents >= 0),
  coupon_discount_cents integer NOT NULL DEFAULT 0 CHECK (coupon_discount_cents >= 0),
  assistance_cents integer NOT NULL DEFAULT 0 CHECK (assistance_cents >= 0),
  net_total_cents integer NOT NULL CHECK (net_total_cents >= 0),
  deposit_due_cents integer NOT NULL CHECK (deposit_due_cents >= 0),
  idempotency_key uuid NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT household_orders_family_fk
    FOREIGN KEY (organization_id, family_id) REFERENCES families (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE household_order_lines (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  family_id uuid NOT NULL,
  camper_id uuid NOT NULL,
  session_id uuid NOT NULL,
  registration_id uuid NULL,
  outcome text NOT NULL CHECK (
    outcome IN ('HELD', 'CONFIRMED', 'WAITLISTED', 'EXPIRED', 'CANCELLED')
  ),
  camper_name text NOT NULL,
  session_name text NOT NULL,
  base_price_cents integer NOT NULL CHECK (base_price_cents >= 0),
  add_on_total_cents integer NOT NULL DEFAULT 0 CHECK (add_on_total_cents >= 0),
  gross_price_cents integer NOT NULL CHECK (gross_price_cents >= 0),
  automatic_discount_cents integer NOT NULL DEFAULT 0 CHECK (automatic_discount_cents >= 0),
  coupon_discount_cents integer NOT NULL DEFAULT 0 CHECK (coupon_discount_cents >= 0),
  assistance_cents integer NOT NULL DEFAULT 0 CHECK (assistance_cents >= 0),
  net_price_cents integer NOT NULL CHECK (net_price_cents >= 0),
  deposit_due_cents integer NOT NULL CHECK (deposit_due_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT household_order_lines_order_fk
    FOREIGN KEY (organization_id, order_id) REFERENCES household_orders (organization_id, id),
  CONSTRAINT household_order_lines_camper_fk
    FOREIGN KEY (organization_id, family_id, camper_id)
    REFERENCES campers (organization_id, family_id, id),
  CONSTRAINT household_order_lines_session_fk
    FOREIGN KEY (organization_id, session_id) REFERENCES sessions (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, order_id, camper_id, session_id)
);

CREATE TABLE capacity_holds (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  session_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (
    status IN ('ACTIVE', 'EXPIRING', 'CONSUMED', 'RELEASED')
  ),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT capacity_holds_order_fk
    FOREIGN KEY (organization_id, order_id) REFERENCES household_orders (organization_id, id),
  CONSTRAINT capacity_holds_line_fk
    FOREIGN KEY (organization_id, order_line_id)
    REFERENCES household_order_lines (organization_id, id),
  CONSTRAINT capacity_holds_session_fk
    FOREIGN KEY (organization_id, session_id) REFERENCES sessions (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, order_line_id)
);

CREATE INDEX capacity_holds_active_idx
  ON capacity_holds (organization_id, session_id, expires_at, id)
  WHERE status IN ('ACTIVE', 'EXPIRING');

ALTER TABLE registrations
  ADD COLUMN order_id uuid NULL,
  ADD COLUMN order_line_id uuid NULL,
  ADD COLUMN waitlist_group_id uuid NULL,
  ADD CONSTRAINT registrations_order_fk
    FOREIGN KEY (organization_id, order_id) REFERENCES household_orders (organization_id, id),
  ADD CONSTRAINT registrations_order_line_fk
    FOREIGN KEY (organization_id, order_line_id)
    REFERENCES household_order_lines (organization_id, id);

CREATE INDEX registrations_waitlist_group_idx
  ON registrations (organization_id, waitlist_group_id, status, registered_at, id)
  WHERE waitlist_group_id IS NOT NULL;

ALTER TABLE waitlist_offers
  ADD COLUMN waitlist_group_id uuid NULL;

ALTER TABLE payment_attempts
  ALTER COLUMN registration_id DROP NOT NULL,
  ADD COLUMN order_id uuid NULL,
  ADD COLUMN purpose text NOT NULL DEFAULT 'DEPOSIT' CHECK (
    purpose IN ('DEPOSIT', 'INSTALLMENT', 'BALANCE')
  ),
  ADD CONSTRAINT payment_attempts_order_fk
    FOREIGN KEY (organization_id, order_id) REFERENCES household_orders (organization_id, id),
  ADD CONSTRAINT payment_attempts_scope_check CHECK (
    (registration_id IS NOT NULL AND order_id IS NULL)
    OR (registration_id IS NULL AND order_id IS NOT NULL)
  );

CREATE TABLE payment_attempt_allocations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  payment_attempt_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT payment_attempt_allocations_attempt_fk
    FOREIGN KEY (organization_id, payment_attempt_id)
    REFERENCES payment_attempts (organization_id, id),
  CONSTRAINT payment_attempt_allocations_line_fk
    FOREIGN KEY (organization_id, order_line_id)
    REFERENCES household_order_lines (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, payment_attempt_id, order_line_id)
);

DROP INDEX registration_payments_attempt_idx;
CREATE UNIQUE INDEX registration_payments_attempt_registration_idx
  ON registration_payments (organization_id, payment_attempt_id, registration_id)
  WHERE payment_attempt_id IS NOT NULL;

ALTER TABLE household_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE household_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_order_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE capacity_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE capacity_holds FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_attempt_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempt_allocations FORCE ROW LEVEL SECURITY;

CREATE POLICY household_orders_tenant_all ON household_orders
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY household_order_lines_tenant_all ON household_order_lines
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY capacity_holds_tenant_all ON capacity_holds
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY payment_attempt_allocations_tenant_all ON payment_attempt_allocations
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON household_orders TO camp_app;
GRANT SELECT, INSERT, UPDATE ON household_order_lines TO camp_app;
GRANT SELECT, INSERT, UPDATE ON capacity_holds TO camp_app;
GRANT SELECT, INSERT ON payment_attempt_allocations TO camp_app;
GRANT INSERT (order_id, order_line_id, waitlist_group_id) ON registrations TO camp_app;
GRANT UPDATE (registration_id, outcome, updated_at) ON household_order_lines TO camp_app;
GRANT UPDATE (status, updated_at) ON capacity_holds TO camp_app;
GRANT UPDATE (status, updated_at) ON household_orders TO camp_app;
GRANT INSERT (order_id, purpose) ON payment_attempts TO camp_app;
GRANT INSERT (waitlist_group_id) ON waitlist_offers TO camp_app;
