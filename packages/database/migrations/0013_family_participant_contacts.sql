ALTER TABLE adults
  ADD COLUMN birth_date date NULL;

ALTER TABLE campers
  ADD COLUMN adult_id uuid NULL,
  ADD COLUMN email text NULL,
  ADD COLUMN email_normalized text NULL;

ALTER TABLE contacts
  ADD COLUMN email text NULL,
  ADD COLUMN email_normalized text NULL,
  ADD COLUMN birth_date date NULL;

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_minimum_age_check,
  DROP CONSTRAINT IF EXISTS sessions_maximum_age_check,
  ADD CONSTRAINT sessions_minimum_age_check CHECK (minimum_age BETWEEN 0 AND 120),
  ADD CONSTRAINT sessions_maximum_age_check CHECK (maximum_age BETWEEN 0 AND 120);

ALTER TABLE programs
  DROP CONSTRAINT IF EXISTS program_default_minimum_age_valid,
  DROP CONSTRAINT IF EXISTS program_default_maximum_age_valid,
  ADD CONSTRAINT program_default_minimum_age_valid CHECK (default_minimum_age BETWEEN 0 AND 120),
  ADD CONSTRAINT program_default_maximum_age_valid CHECK (default_maximum_age BETWEEN 0 AND 120);

ALTER TABLE adults
  ADD CONSTRAINT adults_organization_family_id_unique UNIQUE (organization_id, family_id, id);

ALTER TABLE campers
  ADD CONSTRAINT campers_adult_fk
    FOREIGN KEY (organization_id, family_id, adult_id)
    REFERENCES adults (organization_id, family_id, id);

CREATE UNIQUE INDEX campers_family_adult_id_idx
  ON campers (organization_id, family_id, adult_id)
  WHERE adult_id IS NOT NULL AND archived_at IS NULL;

GRANT INSERT (birth_date) ON adults TO camp_app;
GRANT UPDATE (birth_date) ON adults TO camp_app;

GRANT INSERT (
  adult_id,
  email,
  email_normalized
) ON campers TO camp_app;

GRANT UPDATE (
  adult_id,
  email,
  email_normalized
) ON campers TO camp_app;

GRANT INSERT (
  email,
  email_normalized,
  birth_date
) ON contacts TO camp_app;

GRANT UPDATE (
  email,
  email_normalized,
  birth_date
) ON contacts TO camp_app;
