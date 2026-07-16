ALTER TABLE organizations
  ADD COLUMN waitlist_offer_duration_hours integer NOT NULL DEFAULT 48
  CHECK (waitlist_offer_duration_hours IN (24, 48, 72, 168));

CREATE POLICY organizations_tenant_update ON organizations
  FOR UPDATE
  USING (id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT UPDATE (
  waitlist_offer_duration_hours,
  updated_at
) ON organizations TO camp_app;
