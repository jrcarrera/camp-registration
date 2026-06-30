CREATE POLICY programs_tenant_update ON programs
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT UPDATE (
  name,
  delivery_mode,
  description,
  default_capacity,
  default_minimum_age,
  default_maximum_age,
  default_age_as_of,
  default_price_cents,
  default_deposit_cents,
  default_waitlist_enabled,
  updated_at
) ON programs TO camp_app;
