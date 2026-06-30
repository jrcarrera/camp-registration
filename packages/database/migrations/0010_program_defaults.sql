ALTER TABLE programs
  ADD COLUMN default_capacity integer NOT NULL DEFAULT 20,
  ADD COLUMN default_minimum_age integer NOT NULL DEFAULT 5,
  ADD COLUMN default_maximum_age integer NOT NULL DEFAULT 18,
  ADD COLUMN default_age_as_of text NOT NULL DEFAULT 'SESSION_START',
  ADD COLUMN default_price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN default_deposit_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN default_waitlist_enabled boolean NOT NULL DEFAULT true,
  ADD CONSTRAINT program_default_capacity_valid CHECK (default_capacity > 0),
  ADD CONSTRAINT program_default_minimum_age_valid CHECK (default_minimum_age BETWEEN 0 AND 21),
  ADD CONSTRAINT program_default_maximum_age_valid CHECK (default_maximum_age BETWEEN 0 AND 21),
  ADD CONSTRAINT program_default_ages_valid CHECK (default_minimum_age <= default_maximum_age),
  ADD CONSTRAINT program_default_age_as_of_valid CHECK (
    default_age_as_of IN ('SESSION_START', 'SEASON_START')
  ),
  ADD CONSTRAINT program_default_price_valid CHECK (default_price_cents >= 0),
  ADD CONSTRAINT program_default_deposit_valid CHECK (
    default_deposit_cents >= 0
    AND default_deposit_cents <= default_price_cents
  );

WITH representative_sessions AS (
  SELECT DISTINCT ON (organization_id, program_id)
    organization_id,
    program_id,
    capacity,
    minimum_age,
    maximum_age,
    age_as_of,
    price_cents,
    deposit_cents,
    waitlist_enabled
  FROM sessions
  ORDER BY organization_id, program_id, starts_on, code
)
UPDATE programs p
SET default_capacity = rs.capacity,
    default_minimum_age = rs.minimum_age,
    default_maximum_age = rs.maximum_age,
    default_age_as_of = rs.age_as_of,
    default_price_cents = rs.price_cents,
    default_deposit_cents = rs.deposit_cents,
    default_waitlist_enabled = rs.waitlist_enabled
FROM representative_sessions rs
WHERE p.organization_id = rs.organization_id
  AND p.id = rs.program_id;

GRANT INSERT (
  default_capacity,
  default_minimum_age,
  default_maximum_age,
  default_age_as_of,
  default_price_cents,
  default_deposit_cents,
  default_waitlist_enabled
) ON programs TO camp_app;
