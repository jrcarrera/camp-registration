ALTER TABLE registrations
  ADD COLUMN source text NOT NULL DEFAULT 'ADMIN',
  ADD CONSTRAINT registrations_source_valid CHECK (source IN ('ADMIN', 'PARENT'));

CREATE POLICY registrations_tenant_insert ON registrations
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT INSERT (
  id,
  organization_id,
  session_id,
  family_id,
  camper_id,
  status,
  source
) ON registrations TO camp_app;
