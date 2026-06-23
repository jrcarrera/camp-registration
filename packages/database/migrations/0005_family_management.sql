CREATE TABLE families (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  family_name text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  archived_at timestamptz NULL,
  UNIQUE (organization_id, id)
);

CREATE TABLE adults (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  family_id uuid NOT NULL,
  identity_subject text NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NULL,
  email_normalized text NULL,
  phone text NULL,
  account_owner boolean NOT NULL DEFAULT false,
  can_manage_family boolean NOT NULL DEFAULT false,
  can_register boolean NOT NULL DEFAULT false,
  can_make_payments boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  archived_at timestamptz NULL,
  CONSTRAINT adults_family_fk
    FOREIGN KEY (organization_id, family_id) REFERENCES families (organization_id, id),
  UNIQUE (organization_id, id)
);

CREATE TABLE campers (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  family_id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  birth_date date NOT NULL,
  preferred_name text NULL,
  pronouns text NULL,
  gender text NULL,
  school_grade text NULL,
  school_name text NULL,
  cabin_preference text NULL,
  accessibility_needs text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  archived_at timestamptz NULL,
  CONSTRAINT campers_family_fk
    FOREIGN KEY (organization_id, family_id) REFERENCES families (organization_id, id),
  UNIQUE (organization_id, id)
);

CREATE TABLE contacts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  family_id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  relationship text NOT NULL,
  emergency_contact boolean NOT NULL DEFAULT false,
  authorized_pickup boolean NOT NULL DEFAULT false,
  receives_operational_communication boolean NOT NULL DEFAULT false,
  emergency_priority integer NULL CHECK (emergency_priority IS NULL OR emergency_priority > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  archived_at timestamptz NULL,
  CONSTRAINT contacts_family_fk
    FOREIGN KEY (organization_id, family_id) REFERENCES families (organization_id, id),
  CONSTRAINT contacts_has_role CHECK (
    emergency_contact
    OR authorized_pickup
    OR receives_operational_communication
  ),
  UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX adults_one_owner_per_family_idx
  ON adults (organization_id, family_id)
  WHERE account_owner AND archived_at IS NULL;

CREATE UNIQUE INDEX adults_family_email_normalized_idx
  ON adults (organization_id, family_id, email_normalized)
  WHERE email_normalized IS NOT NULL AND archived_at IS NULL;

CREATE INDEX families_organization_name_idx
  ON families (organization_id, lower(family_name), id)
  WHERE archived_at IS NULL;

CREATE INDEX adults_family_idx
  ON adults (organization_id, family_id, lower(last_name), lower(first_name), id)
  WHERE archived_at IS NULL;

CREATE INDEX campers_family_idx
  ON campers (organization_id, family_id, lower(last_name), lower(first_name), id)
  WHERE archived_at IS NULL;

CREATE INDEX contacts_family_idx
  ON contacts (organization_id, family_id, emergency_priority NULLS LAST, lower(last_name), id)
  WHERE archived_at IS NULL;

ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE families FORCE ROW LEVEL SECURITY;
ALTER TABLE adults ENABLE ROW LEVEL SECURITY;
ALTER TABLE adults FORCE ROW LEVEL SECURITY;
ALTER TABLE campers ENABLE ROW LEVEL SECURITY;
ALTER TABLE campers FORCE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY families_tenant_select ON families
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY families_tenant_insert ON families
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY families_tenant_update ON families
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY adults_tenant_select ON adults
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY adults_tenant_insert ON adults
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY adults_tenant_update ON adults
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY campers_tenant_select ON campers
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY campers_tenant_insert ON campers
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY campers_tenant_update ON campers
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY contacts_tenant_select ON contacts
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY contacts_tenant_insert ON contacts
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY contacts_tenant_update ON contacts
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON families, adults, campers, contacts FROM camp_app;

GRANT SELECT ON families, adults, campers, contacts TO camp_app;

GRANT INSERT (
  id,
  organization_id,
  family_name
) ON families TO camp_app;

GRANT UPDATE (
  family_name,
  version,
  updated_at
) ON families TO camp_app;

GRANT INSERT (
  id,
  organization_id,
  family_id,
  identity_subject,
  first_name,
  last_name,
  email,
  email_normalized,
  phone,
  account_owner,
  can_manage_family,
  can_register,
  can_make_payments
) ON adults TO camp_app;

GRANT UPDATE (
  identity_subject,
  first_name,
  last_name,
  email,
  email_normalized,
  phone,
  account_owner,
  can_manage_family,
  can_register,
  can_make_payments,
  version,
  updated_at
) ON adults TO camp_app;

GRANT INSERT (
  id,
  organization_id,
  family_id,
  first_name,
  last_name,
  birth_date,
  preferred_name,
  pronouns,
  gender,
  school_grade,
  school_name,
  cabin_preference,
  accessibility_needs
) ON campers TO camp_app;

GRANT UPDATE (
  first_name,
  last_name,
  birth_date,
  preferred_name,
  pronouns,
  gender,
  school_grade,
  school_name,
  cabin_preference,
  accessibility_needs,
  version,
  updated_at
) ON campers TO camp_app;

GRANT INSERT (
  id,
  organization_id,
  family_id,
  first_name,
  last_name,
  phone,
  relationship,
  emergency_contact,
  authorized_pickup,
  receives_operational_communication,
  emergency_priority
) ON contacts TO camp_app;

GRANT UPDATE (
  first_name,
  last_name,
  phone,
  relationship,
  emergency_contact,
  authorized_pickup,
  receives_operational_communication,
  emergency_priority,
  version,
  updated_at
) ON contacts TO camp_app;
