CREATE TABLE operational_report_views (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  preset text NOT NULL CHECK (
    preset IN (
      'SESSION_ROSTER', 'CHECK_IN_SHEET', 'CONTACT_LIST', 'BALANCE_DUE',
      'WAITLIST', 'READINESS', 'ATTENDANCE', 'PICKUP_SHEET', 'CAMPER_LABELS'
    )
  ),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
  default_format text NOT NULL DEFAULT 'CSV' CHECK (default_format IN ('CSV', 'XLSX', 'PRINT')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name)
);

CREATE INDEX operational_report_views_name_idx
  ON operational_report_views (organization_id, lower(name), id);

ALTER TABLE operational_report_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_report_views FORCE ROW LEVEL SECURITY;

CREATE POLICY operational_report_views_tenant_all ON operational_report_views
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON operational_report_views FROM camp_app;
GRANT SELECT, INSERT, DELETE ON operational_report_views TO camp_app;
GRANT UPDATE (
  name, preset, filters, default_format, version, updated_at
) ON operational_report_views TO camp_app;
