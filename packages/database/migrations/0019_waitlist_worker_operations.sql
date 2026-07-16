ALTER TABLE organizations
  ADD COLUMN waitlist_automation_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE waitlist_worker_status (
  organization_id uuid PRIMARY KEY REFERENCES organizations (id),
  worker_id text NOT NULL,
  last_started_at timestamptz NOT NULL,
  last_completed_at timestamptz NULL,
  last_succeeded_at timestamptz NULL,
  last_failed_at timestamptz NULL,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_error_code text NULL,
  delivered_count integer NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
  delivery_failure_count integer NOT NULL DEFAULT 0 CHECK (delivery_failure_count >= 0),
  expired_offer_count integer NOT NULL DEFAULT 0 CHECK (expired_offer_count >= 0),
  offers_created_count integer NOT NULL DEFAULT 0 CHECK (offers_created_count >= 0),
  reminders_queued_count integer NOT NULL DEFAULT 0 CHECK (reminders_queued_count >= 0),
  sessions_scanned_count integer NOT NULL DEFAULT 0 CHECK (sessions_scanned_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

ALTER TABLE waitlist_worker_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_worker_status FORCE ROW LEVEL SECURITY;

CREATE POLICY waitlist_worker_status_tenant_select ON waitlist_worker_status
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY waitlist_worker_status_tenant_insert ON waitlist_worker_status
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY waitlist_worker_status_tenant_update ON waitlist_worker_status
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON waitlist_worker_status FROM camp_app;
GRANT SELECT ON waitlist_worker_status TO camp_app;
GRANT INSERT (
  organization_id,
  worker_id,
  last_started_at,
  last_completed_at,
  last_succeeded_at,
  last_failed_at,
  consecutive_failures,
  last_error_code,
  delivered_count,
  delivery_failure_count,
  expired_offer_count,
  offers_created_count,
  reminders_queued_count,
  sessions_scanned_count,
  updated_at
) ON waitlist_worker_status TO camp_app;
GRANT UPDATE (
  worker_id,
  last_started_at,
  last_completed_at,
  last_succeeded_at,
  last_failed_at,
  consecutive_failures,
  last_error_code,
  delivered_count,
  delivery_failure_count,
  expired_offer_count,
  offers_created_count,
  reminders_queued_count,
  sessions_scanned_count,
  updated_at
) ON waitlist_worker_status TO camp_app;

CREATE OR REPLACE FUNCTION list_waitlist_worker_organizations()
RETURNS TABLE (organization_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT organizations.id
  FROM public.organizations
  WHERE organizations.waitlist_automation_enabled
  ORDER BY organizations.id
$$;

REVOKE ALL ON FUNCTION list_waitlist_worker_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_waitlist_worker_organizations() TO camp_app;
