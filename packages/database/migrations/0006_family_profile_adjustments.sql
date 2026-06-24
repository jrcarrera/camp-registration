ALTER TABLE adults
  ADD COLUMN emergency_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN authorized_pickup boolean NOT NULL DEFAULT false,
  ADD COLUMN receives_operational_communication boolean NOT NULL DEFAULT false;

ALTER TABLE campers
  DROP COLUMN pronouns,
  DROP COLUMN school_name,
  ADD CONSTRAINT campers_gender_binary CHECK (gender IS NULL OR gender IN ('Female', 'Male'));

GRANT INSERT (
  emergency_contact,
  authorized_pickup,
  receives_operational_communication
) ON adults TO camp_app;

GRANT UPDATE (
  emergency_contact,
  authorized_pickup,
  receives_operational_communication
) ON adults TO camp_app;
