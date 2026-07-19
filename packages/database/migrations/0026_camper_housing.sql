ALTER TABLE household_order_lines
  ADD COLUMN bunk_buddy_names text[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT household_order_lines_bunk_buddies_limit
    CHECK (cardinality(bunk_buddy_names) <= 3);

ALTER TABLE registrations
  ADD COLUMN bunk_buddy_names text[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT registrations_bunk_buddies_limit
    CHECK (cardinality(bunk_buddy_names) <= 3),
  ADD CONSTRAINT registrations_org_id_session_unique
    UNIQUE (organization_id, id, session_id);

CREATE TABLE housing_buildings (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  name text NOT NULL,
  code text NOT NULL,
  description text NULL,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code)
);

CREATE TABLE housing_beds (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  building_id uuid NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT housing_beds_building_fk FOREIGN KEY (organization_id, building_id)
    REFERENCES housing_buildings (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, building_id, name),
  UNIQUE (organization_id, building_id, id)
);

CREATE TABLE session_housing_buildings (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  session_id uuid NOT NULL,
  building_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  closed_reason text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT session_housing_session_fk FOREIGN KEY (organization_id, session_id)
    REFERENCES sessions (organization_id, id),
  CONSTRAINT session_housing_building_fk FOREIGN KEY (organization_id, building_id)
    REFERENCES housing_buildings (organization_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, session_id, building_id),
  UNIQUE (organization_id, session_id, building_id, id)
);

CREATE TABLE housing_assignments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  session_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  building_id uuid NOT NULL,
  bed_id uuid NOT NULL,
  session_building_id uuid NOT NULL,
  assignment_method text NOT NULL CHECK (
    assignment_method IN ('MANUAL', 'AUTO_BALANCED', 'AUTO_CONSOLIDATED')
  ),
  assigned_by text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT housing_assignment_registration_fk
    FOREIGN KEY (organization_id, registration_id, session_id)
    REFERENCES registrations (organization_id, id, session_id),
  CONSTRAINT housing_assignment_bed_fk FOREIGN KEY (organization_id, building_id, bed_id)
    REFERENCES housing_beds (organization_id, building_id, id),
  CONSTRAINT housing_assignment_session_building_fk
    FOREIGN KEY (organization_id, session_id, building_id, session_building_id)
    REFERENCES session_housing_buildings (organization_id, session_id, building_id, id),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, session_id, registration_id),
  UNIQUE (organization_id, session_id, bed_id)
);

CREATE INDEX housing_assignments_bed_idx
  ON housing_assignments (organization_id, bed_id, session_id);

ALTER TABLE housing_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE housing_buildings FORCE ROW LEVEL SECURITY;
ALTER TABLE housing_beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE housing_beds FORCE ROW LEVEL SECURITY;
ALTER TABLE session_housing_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_housing_buildings FORCE ROW LEVEL SECURITY;
ALTER TABLE housing_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE housing_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY housing_buildings_tenant_all ON housing_buildings
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY housing_beds_tenant_all ON housing_beds
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY session_housing_buildings_tenant_all ON session_housing_buildings
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY housing_assignments_tenant_all ON housing_assignments
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON housing_buildings TO camp_app;
GRANT SELECT, INSERT, UPDATE ON housing_beds TO camp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON session_housing_buildings TO camp_app;
GRANT SELECT, INSERT, DELETE ON housing_assignments TO camp_app;
GRANT UPDATE (bunk_buddy_names) ON household_order_lines TO camp_app;
GRANT INSERT (bunk_buddy_names) ON registrations TO camp_app;
