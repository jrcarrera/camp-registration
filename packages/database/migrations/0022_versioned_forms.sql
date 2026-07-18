CREATE TABLE form_templates (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  draft_fields jsonb NOT NULL CHECK (jsonb_typeof(draft_fields) = 'array'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, id)
);

CREATE TABLE form_versions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  template_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  name text NOT NULL,
  description text NOT NULL,
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'array'),
  published_by text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT form_versions_template_fk
    FOREIGN KEY (organization_id, template_id)
    REFERENCES form_templates (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, template_id, version_number)
);

CREATE TABLE form_assignments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  form_version_id uuid NOT NULL,
  session_id uuid NOT NULL,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT form_assignments_version_fk
    FOREIGN KEY (organization_id, form_version_id)
    REFERENCES form_versions (organization_id, id),
  CONSTRAINT form_assignments_session_fk
    FOREIGN KEY (organization_id, session_id)
    REFERENCES sessions (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, form_version_id, session_id)
);

CREATE TABLE form_submissions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  assignment_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(responses) = 'object'),
  signer_name text,
  signer_actor_id text,
  status text NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED')),
  submitted_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT form_submissions_assignment_fk
    FOREIGN KEY (organization_id, assignment_id)
    REFERENCES form_assignments (organization_id, id),
  CONSTRAINT form_submissions_registration_fk
    FOREIGN KEY (organization_id, registration_id)
    REFERENCES registrations (organization_id, id),
  CONSTRAINT form_submissions_signature_valid CHECK (
    (status = 'DRAFT' AND submitted_at IS NULL)
    OR (status = 'SUBMITTED' AND submitted_at IS NOT NULL AND signer_actor_id IS NOT NULL)
  ),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, assignment_id, registration_id)
);

CREATE INDEX form_versions_template_idx
  ON form_versions (organization_id, template_id, version_number DESC);
CREATE INDEX form_assignments_session_idx
  ON form_assignments (organization_id, session_id, form_version_id);
CREATE INDEX form_submissions_registration_idx
  ON form_submissions (organization_id, registration_id, status);

ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE form_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE form_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions FORCE ROW LEVEL SECURITY;

CREATE POLICY form_templates_tenant_all ON form_templates
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY form_versions_tenant_select ON form_versions
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY form_versions_tenant_insert ON form_versions
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY form_assignments_tenant_select ON form_assignments
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY form_assignments_tenant_insert ON form_assignments
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY form_submissions_tenant_select ON form_submissions
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY form_submissions_tenant_insert ON form_submissions
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY form_submissions_tenant_update ON form_submissions
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON form_templates, form_versions, form_assignments, form_submissions FROM camp_app;
GRANT SELECT, INSERT ON form_templates, form_versions, form_assignments, form_submissions TO camp_app;
GRANT UPDATE (name, description, draft_fields, version, updated_at) ON form_templates TO camp_app;
GRANT UPDATE (
  responses,
  signer_name,
  signer_actor_id,
  status,
  submitted_at,
  version,
  updated_at
) ON form_submissions TO camp_app;
