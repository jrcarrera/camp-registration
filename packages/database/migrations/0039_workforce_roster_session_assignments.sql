CREATE TABLE workforce_profiles (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  account_id text NULL REFERENCES user_accounts (id),
  first_name text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 100),
  last_name text NOT NULL CHECK (length(btrim(last_name)) BETWEEN 1 AND 100),
  preferred_name text NULL CHECK (preferred_name IS NULL OR length(btrim(preferred_name)) BETWEEN 1 AND 100),
  email text NOT NULL CHECK (length(btrim(email)) BETWEEN 3 AND 320),
  email_normalized text NOT NULL CHECK (email_normalized = lower(btrim(email)) AND length(email_normalized) BETWEEN 3 AND 320),
  phone text NULL CHECK (phone IS NULL OR length(btrim(phone)) BETWEEN 1 AND 50),
  workforce_type text NOT NULL CHECK (workforce_type IN ('STAFF', 'VOLUNTEER')),
  status text NOT NULL CHECK (status IN ('PLANNED', 'ACTIVE', 'INACTIVE')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, email_normalized),
  UNIQUE (organization_id, account_id)
);

CREATE TABLE workforce_session_assignments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  workforce_profile_id uuid NOT NULL,
  session_id uuid NOT NULL,
  position_name text NOT NULL CHECK (length(btrim(position_name)) BETWEEN 1 AND 100),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL CHECK (status IN ('PLANNED', 'CONFIRMED', 'CANCELLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT workforce_assignment_dates_valid CHECK (starts_on <= ends_on),
  CONSTRAINT workforce_assignment_profile_tenant_fk
    FOREIGN KEY (organization_id, workforce_profile_id)
    REFERENCES workforce_profiles (organization_id, id),
  CONSTRAINT workforce_assignment_session_tenant_fk
    FOREIGN KEY (organization_id, session_id)
    REFERENCES sessions (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, workforce_profile_id, session_id, position_name, starts_on, ends_on)
);

CREATE INDEX workforce_profiles_list_idx
  ON workforce_profiles (organization_id, status, workforce_type, lower(last_name), lower(first_name), id);
CREATE INDEX workforce_assignments_session_idx
  ON workforce_session_assignments (organization_id, session_id, status, starts_on, id);
CREATE INDEX workforce_assignments_profile_idx
  ON workforce_session_assignments (organization_id, workforce_profile_id, starts_on, id);

ALTER TABLE workforce_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE workforce_session_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_session_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY workforce_profiles_tenant_all ON workforce_profiles
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY workforce_assignments_tenant_all ON workforce_session_assignments
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON workforce_profiles, workforce_session_assignments FROM camp_app;
GRANT SELECT, INSERT (
  id, organization_id, account_id, first_name, last_name, preferred_name, email, email_normalized,
  phone, workforce_type, status, created_by
) ON workforce_profiles TO camp_app;
GRANT UPDATE (
  account_id, first_name, last_name, preferred_name, email, email_normalized, phone,
  workforce_type, status, version, updated_at
) ON workforce_profiles TO camp_app;
GRANT SELECT, INSERT (
  id, organization_id, workforce_profile_id, session_id, position_name, starts_on, ends_on,
  status, created_by
) ON workforce_session_assignments TO camp_app;
GRANT UPDATE (position_name, starts_on, ends_on, status, version, updated_at)
  ON workforce_session_assignments TO camp_app;
