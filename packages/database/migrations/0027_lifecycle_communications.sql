CREATE TABLE communication_templates (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  subject text NOT NULL CHECK (length(btrim(subject)) > 0),
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, id)
);

CREATE TABLE communication_campaigns (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  template_id uuid NOT NULL,
  template_version integer NOT NULL CHECK (template_version > 0),
  session_id uuid NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  audience_type text NOT NULL CHECK (
    audience_type IN ('SESSION_CONFIRMED', 'SESSION_WAITLISTED', 'MISSING_FORMS', 'BALANCE_DUE')
  ),
  subject_snapshot text NOT NULL,
  body_snapshot text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'QUEUED', 'CANCELLED')),
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  created_by text NOT NULL,
  queued_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT communication_campaigns_template_fk
    FOREIGN KEY (organization_id, template_id)
    REFERENCES communication_templates (organization_id, id),
  CONSTRAINT communication_campaigns_session_fk
    FOREIGN KEY (organization_id, session_id)
    REFERENCES sessions (organization_id, id),
  CONSTRAINT communication_campaigns_session_scope CHECK (
    audience_type = 'BALANCE_DUE' OR session_id IS NOT NULL
  ),
  UNIQUE (organization_id, id)
);

CREATE INDEX communication_templates_status_idx
  ON communication_templates (organization_id, status, lower(name), id);
CREATE INDEX communication_campaigns_schedule_idx
  ON communication_campaigns (organization_id, status, scheduled_for, id);

ALTER TABLE notification_outbox
  ADD COLUMN communication_campaign_id uuid NULL,
  DROP CONSTRAINT notification_outbox_notification_type_check,
  ADD CONSTRAINT notification_outbox_notification_type_check CHECK (
    notification_type IN (
      'WAITLIST_OFFERED', 'WAITLIST_EXPIRING_SOON', 'WAITLIST_ACCEPTED',
      'WAITLIST_DECLINED', 'WAITLIST_EXPIRED', 'WAITLIST_CANCELLED',
      'PAYMENT_RECEIPT', 'ORDER_CONFIRMATION', 'INSTALLMENT_DUE_SOON', 'INSTALLMENT_DUE',
      'LIFECYCLE_MESSAGE'
    )
  ),
  ADD CONSTRAINT notification_outbox_communication_campaign_fk
    FOREIGN KEY (organization_id, communication_campaign_id)
    REFERENCES communication_campaigns (organization_id, id);

CREATE INDEX notification_outbox_communication_campaign_idx
  ON notification_outbox (organization_id, communication_campaign_id, status, created_at, id)
  WHERE communication_campaign_id IS NOT NULL;

ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE communication_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_campaigns FORCE ROW LEVEL SECURITY;

CREATE POLICY communication_templates_tenant_all ON communication_templates
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY communication_campaigns_tenant_all ON communication_campaigns
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON communication_templates, communication_campaigns FROM camp_app;
GRANT SELECT, INSERT ON communication_templates, communication_campaigns TO camp_app;
GRANT UPDATE (
  name, description, subject, body, status, version, updated_at
) ON communication_templates TO camp_app;
GRANT UPDATE (
  status, recipient_count, queued_at, cancelled_at, updated_at
) ON communication_campaigns TO camp_app;
GRANT INSERT (communication_campaign_id) ON notification_outbox TO camp_app;

CREATE OR REPLACE FUNCTION list_communication_worker_organizations()
RETURNS TABLE (organization_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT organizations.id
  FROM public.organizations
  ORDER BY organizations.id
$$;

REVOKE ALL ON FUNCTION list_communication_worker_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_communication_worker_organizations() TO camp_app;
