CREATE TABLE session_add_ons (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  session_id uuid NOT NULL,
  name text NOT NULL,
  description text NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT session_add_ons_session_fk
    FOREIGN KEY (organization_id, session_id) REFERENCES sessions (organization_id, id),
  UNIQUE (organization_id, id)
);

CREATE TABLE discount_rules (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  season_id uuid NOT NULL,
  name text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN ('SIBLING', 'MULTI_SESSION')),
  value_type text NOT NULL CHECK (value_type IN ('FIXED', 'PERCENT')),
  value integer NOT NULL CHECK (value > 0),
  minimum_qualifying_lines integer NOT NULL DEFAULT 2 CHECK (minimum_qualifying_lines >= 2),
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT discount_rules_season_fk
    FOREIGN KEY (organization_id, season_id) REFERENCES seasons (organization_id, id),
  CONSTRAINT discount_rules_value_valid CHECK (
    (value_type = 'FIXED' AND value <= 10000000)
    OR (value_type = 'PERCENT' AND value <= 10000)
  ),
  UNIQUE (organization_id, id)
);

CREATE TABLE coupons (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  season_id uuid NOT NULL,
  code text NOT NULL,
  code_normalized text NOT NULL,
  value_type text NOT NULL CHECK (value_type IN ('FIXED', 'PERCENT')),
  value integer NOT NULL CHECK (value > 0),
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  maximum_redemptions integer NULL CHECK (maximum_redemptions > 0),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT coupons_season_fk
    FOREIGN KEY (organization_id, season_id) REFERENCES seasons (organization_id, id),
  CONSTRAINT coupons_value_valid CHECK (
    (value_type = 'FIXED' AND value <= 10000000)
    OR (value_type = 'PERCENT' AND value <= 10000)
  ),
  CONSTRAINT coupons_window_valid CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code_normalized)
);

CREATE TABLE financial_assistance_applications (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  family_id uuid NOT NULL,
  season_id uuid NOT NULL,
  camper_id uuid NULL,
  status text NOT NULL CHECK (
    status IN ('DRAFT', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'DENIED', 'WITHDRAWN')
  ),
  requested_cents integer NOT NULL CHECK (requested_cents > 0),
  statement text NOT NULL,
  internal_note text NULL,
  submitted_at timestamptz NULL,
  reviewed_at timestamptz NULL,
  reviewed_by text NULL,
  created_by text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT assistance_applications_family_fk
    FOREIGN KEY (organization_id, family_id) REFERENCES families (organization_id, id),
  CONSTRAINT assistance_applications_season_fk
    FOREIGN KEY (organization_id, season_id) REFERENCES seasons (organization_id, id),
  CONSTRAINT assistance_applications_camper_fk
    FOREIGN KEY (organization_id, family_id, camper_id)
    REFERENCES campers (organization_id, family_id, id),
  UNIQUE (organization_id, id)
);

CREATE TABLE financial_assistance_awards (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  application_id uuid NOT NULL,
  family_id uuid NOT NULL,
  season_id uuid NOT NULL,
  camper_id uuid NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  reserved_cents integer NOT NULL DEFAULT 0 CHECK (reserved_cents >= 0),
  consumed_cents integer NOT NULL DEFAULT 0 CHECK (consumed_cents >= 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXHAUSTED', 'REVOKED')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT assistance_awards_application_fk
    FOREIGN KEY (organization_id, application_id)
    REFERENCES financial_assistance_applications (organization_id, id),
  CONSTRAINT assistance_awards_family_fk
    FOREIGN KEY (organization_id, family_id) REFERENCES families (organization_id, id),
  CONSTRAINT assistance_awards_season_fk
    FOREIGN KEY (organization_id, season_id) REFERENCES seasons (organization_id, id),
  CONSTRAINT assistance_awards_amount_valid CHECK (
    reserved_cents + consumed_cents <= amount_cents
  ),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, application_id)
);

CREATE TABLE payment_plan_templates (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  season_id uuid NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT payment_plan_templates_season_fk
    FOREIGN KEY (organization_id, season_id) REFERENCES seasons (organization_id, id),
  UNIQUE (organization_id, id)
);

CREATE TABLE payment_plan_template_installments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  template_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence BETWEEN 1 AND 6),
  due_on date NOT NULL,
  percentage_basis_points integer NOT NULL CHECK (percentage_basis_points BETWEEN 1 AND 10000),
  CONSTRAINT payment_plan_template_installments_template_fk
    FOREIGN KEY (organization_id, template_id)
    REFERENCES payment_plan_templates (organization_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, template_id, sequence)
);

CREATE TABLE order_line_add_ons (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  add_on_id uuid NOT NULL,
  name text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  required boolean NOT NULL,
  CONSTRAINT order_line_add_ons_line_fk
    FOREIGN KEY (organization_id, order_line_id)
    REFERENCES household_order_lines (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, order_line_id, add_on_id)
);

CREATE TABLE order_adjustments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  adjustment_type text NOT NULL CHECK (
    adjustment_type IN ('AUTOMATIC_DISCOUNT', 'COUPON', 'ASSISTANCE')
  ),
  source_id uuid NULL,
  label text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT order_adjustments_order_fk
    FOREIGN KEY (organization_id, order_id) REFERENCES household_orders (organization_id, id),
  CONSTRAINT order_adjustments_line_fk
    FOREIGN KEY (organization_id, order_line_id)
    REFERENCES household_order_lines (organization_id, id),
  UNIQUE (organization_id, id)
);

CREATE TABLE coupon_redemptions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  coupon_id uuid NOT NULL,
  family_id uuid NOT NULL,
  order_id uuid NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT coupon_redemptions_coupon_fk
    FOREIGN KEY (organization_id, coupon_id) REFERENCES coupons (organization_id, id),
  CONSTRAINT coupon_redemptions_order_fk
    FOREIGN KEY (organization_id, order_id) REFERENCES household_orders (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, coupon_id, family_id)
);

CREATE TABLE assistance_award_allocations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  award_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL CHECK (status IN ('RESERVED', 'CONSUMED', 'RELEASED')),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT assistance_allocations_award_fk
    FOREIGN KEY (organization_id, award_id)
    REFERENCES financial_assistance_awards (organization_id, id),
  CONSTRAINT assistance_allocations_order_fk
    FOREIGN KEY (organization_id, order_id) REFERENCES household_orders (organization_id, id),
  CONSTRAINT assistance_allocations_line_fk
    FOREIGN KEY (organization_id, order_line_id)
    REFERENCES household_order_lines (organization_id, id),
  UNIQUE (organization_id, id)
);

CREATE TABLE order_installments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  family_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence BETWEEN 1 AND 6),
  due_on date NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (
    status IN ('SCHEDULED', 'DUE', 'OVERDUE', 'PAID')
  ),
  paid_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT order_installments_order_fk
    FOREIGN KEY (organization_id, order_id) REFERENCES household_orders (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, order_id, sequence)
);

ALTER TABLE household_orders
  ADD COLUMN coupon_id uuid NULL,
  ADD COLUMN coupon_code text NULL,
  ADD COLUMN payment_plan_template_id uuid NULL;

ALTER TABLE payment_attempts
  ADD COLUMN installment_id uuid NULL,
  ADD CONSTRAINT payment_attempts_installment_fk
    FOREIGN KEY (organization_id, installment_id)
    REFERENCES order_installments (organization_id, id),
  ADD CONSTRAINT payment_attempts_installment_scope_check CHECK (
    (purpose = 'INSTALLMENT' AND installment_id IS NOT NULL AND order_id IS NOT NULL)
    OR (purpose <> 'INSTALLMENT' AND installment_id IS NULL)
  );

ALTER TABLE notification_outbox
  DROP CONSTRAINT notification_outbox_notification_type_check,
  ADD CONSTRAINT notification_outbox_notification_type_check CHECK (
    notification_type IN (
      'WAITLIST_OFFERED', 'WAITLIST_EXPIRING_SOON', 'WAITLIST_ACCEPTED',
      'WAITLIST_DECLINED', 'WAITLIST_EXPIRED', 'WAITLIST_CANCELLED',
      'PAYMENT_RECEIPT', 'ORDER_CONFIRMATION', 'INSTALLMENT_DUE_SOON', 'INSTALLMENT_DUE'
    )
  );

ALTER TABLE session_add_ons ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_add_ons FORCE ROW LEVEL SECURITY;
ALTER TABLE discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_assistance_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_assistance_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_assistance_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_assistance_awards FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plan_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_plan_template_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plan_template_installments FORCE ROW LEVEL SECURITY;
ALTER TABLE order_line_add_ons ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_add_ons FORCE ROW LEVEL SECURITY;
ALTER TABLE order_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_adjustments FORCE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions FORCE ROW LEVEL SECURITY;
ALTER TABLE assistance_award_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistance_award_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE order_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_installments FORCE ROW LEVEL SECURITY;

CREATE POLICY session_add_ons_tenant_all ON session_add_ons USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY discount_rules_tenant_all ON discount_rules USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY coupons_tenant_all ON coupons USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY assistance_applications_tenant_all ON financial_assistance_applications USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY assistance_awards_tenant_all ON financial_assistance_awards USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY payment_plan_templates_tenant_all ON payment_plan_templates USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY payment_plan_template_installments_tenant_all ON payment_plan_template_installments USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY order_line_add_ons_tenant_all ON order_line_add_ons USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY order_adjustments_tenant_all ON order_adjustments USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY coupon_redemptions_tenant_all ON coupon_redemptions USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY assistance_allocations_tenant_all ON assistance_award_allocations USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY order_installments_tenant_all ON order_installments USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON session_add_ons TO camp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON discount_rules TO camp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON coupons TO camp_app;
GRANT SELECT, INSERT, UPDATE ON financial_assistance_applications TO camp_app;
GRANT SELECT, INSERT, UPDATE ON financial_assistance_awards TO camp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_plan_templates TO camp_app;
GRANT SELECT, INSERT, DELETE ON payment_plan_template_installments TO camp_app;
GRANT SELECT, INSERT ON order_line_add_ons TO camp_app;
GRANT SELECT, INSERT ON order_adjustments TO camp_app;
GRANT SELECT, INSERT, DELETE ON coupon_redemptions TO camp_app;
GRANT SELECT, INSERT, UPDATE ON assistance_award_allocations TO camp_app;
GRANT SELECT, INSERT, UPDATE ON order_installments TO camp_app;
GRANT UPDATE (coupon_id, coupon_code, payment_plan_template_id) ON household_orders TO camp_app;
GRANT INSERT (installment_id) ON payment_attempts TO camp_app;
