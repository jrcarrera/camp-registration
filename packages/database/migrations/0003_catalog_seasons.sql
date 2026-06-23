CREATE POLICY seasons_tenant_insert ON seasons
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT INSERT (
  id,
  organization_id,
  name,
  year
) ON seasons TO camp_app;
