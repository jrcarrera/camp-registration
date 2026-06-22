CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE seasons (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  name text NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, year)
);

CREATE TABLE programs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  code text NOT NULL,
  name text NOT NULL,
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('DAY', 'OVERNIGHT')),
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  season_id uuid NOT NULL,
  program_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  registration_opens_at timestamptz NOT NULL,
  registration_closes_at timestamptz NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  minimum_age integer NOT NULL CHECK (minimum_age BETWEEN 0 AND 21),
  maximum_age integer NOT NULL CHECK (maximum_age BETWEEN 0 AND 21),
  age_as_of text NOT NULL CHECK (age_as_of IN ('SESSION_START', 'SEASON_START')),
  currency text NOT NULL CHECK (currency = 'USD'),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  deposit_cents integer NOT NULL CHECK (deposit_cents >= 0),
  waitlist_enabled boolean NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED', 'ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT session_dates_valid CHECK (starts_on <= ends_on),
  CONSTRAINT session_registration_window_valid CHECK (
    registration_opens_at < registration_closes_at
    AND registration_closes_at < starts_on::timestamp AT TIME ZONE 'UTC' + interval '1 day'
  ),
  CONSTRAINT session_ages_valid CHECK (minimum_age <= maximum_age),
  CONSTRAINT session_deposit_valid CHECK (deposit_cents <= price_cents),
  CONSTRAINT sessions_season_organization_fk
    FOREIGN KEY (organization_id, season_id) REFERENCES seasons (organization_id, id),
  CONSTRAINT sessions_program_organization_fk
    FOREIGN KEY (organization_id, program_id) REFERENCES programs (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code)
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  actor_id text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  outcome text NOT NULL,
  request_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE INDEX sessions_organization_season_dates_idx
  ON sessions (organization_id, season_id, starts_on, id);
CREATE INDEX audit_events_organization_time_idx
  ON audit_events (organization_id, occurred_at DESC, id DESC);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons FORCE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY organizations_tenant_select ON organizations
  FOR SELECT
  USING (id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY seasons_tenant_select ON seasons
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY programs_tenant_select ON programs
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY sessions_tenant_select ON sessions
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY sessions_tenant_update ON sessions
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY audit_events_tenant_insert ON audit_events
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON organizations, seasons, programs, sessions, audit_events FROM camp_app;
GRANT SELECT ON organizations, seasons, programs, sessions TO camp_app;
GRANT UPDATE (
  program_id,
  name,
  starts_on,
  ends_on,
  registration_opens_at,
  registration_closes_at,
  capacity,
  minimum_age,
  maximum_age,
  age_as_of,
  price_cents,
  deposit_cents,
  waitlist_enabled,
  status,
  version,
  updated_at
) ON sessions TO camp_app;
GRANT INSERT ON audit_events TO camp_app;
GRANT USAGE, SELECT ON SEQUENCE audit_events_id_seq TO camp_app;
