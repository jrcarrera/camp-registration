CREATE INDEX adults_identity_subject_idx
  ON adults (organization_id, identity_subject, family_id)
  WHERE identity_subject IS NOT NULL AND archived_at IS NULL;

CREATE POLICY registrations_tenant_update ON registrations
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT UPDATE (
  status,
  updated_at
) ON registrations TO camp_app;
