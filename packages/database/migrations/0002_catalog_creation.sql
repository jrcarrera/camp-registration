CREATE POLICY programs_tenant_insert ON programs
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY sessions_tenant_insert ON sessions
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT INSERT (
  id,
  organization_id,
  code,
  name,
  delivery_mode,
  description
) ON programs TO camp_app;

GRANT INSERT (
  id,
  organization_id,
  season_id,
  program_id,
  code,
  name,
  starts_on,
  ends_on,
  registration_opens_at,
  registration_closes_at,
  capacity,
  minimum_age,
  maximum_age,
  age_as_of,
  currency,
  price_cents,
  deposit_cents,
  waitlist_enabled,
  status
) ON sessions TO camp_app;
