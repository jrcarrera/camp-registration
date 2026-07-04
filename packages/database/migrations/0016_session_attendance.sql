CREATE TABLE registration_attendance (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  session_id uuid NOT NULL,
  family_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  attendance_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('CHECKED_IN', 'CHECKED_OUT', 'ABSENT')),
  checked_in_at timestamptz NULL,
  checked_out_at timestamptz NULL,
  pickup_name text NULL,
  note text NULL,
  recorded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT registration_attendance_session_fk
    FOREIGN KEY (organization_id, session_id) REFERENCES sessions (organization_id, id),
  CONSTRAINT registration_attendance_registration_fk
    FOREIGN KEY (organization_id, family_id, registration_id)
    REFERENCES registrations (organization_id, family_id, id),
  CONSTRAINT registration_attendance_status_fields_valid CHECK (
    (
      status = 'CHECKED_IN'
      AND checked_in_at IS NOT NULL
      AND checked_out_at IS NULL
      AND pickup_name IS NULL
    )
    OR (
      status = 'CHECKED_OUT'
      AND checked_in_at IS NOT NULL
      AND checked_out_at IS NOT NULL
      AND pickup_name IS NOT NULL
    )
    OR (
      status = 'ABSENT'
      AND checked_in_at IS NULL
      AND checked_out_at IS NULL
      AND pickup_name IS NULL
    )
  ),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, registration_id, attendance_date)
);

CREATE INDEX registration_attendance_session_day_idx
  ON registration_attendance (organization_id, session_id, attendance_date, status);

CREATE INDEX registration_attendance_registration_day_idx
  ON registration_attendance (organization_id, registration_id, attendance_date);

ALTER TABLE registration_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_attendance FORCE ROW LEVEL SECURITY;

CREATE POLICY registration_attendance_tenant_select ON registration_attendance
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY registration_attendance_tenant_insert ON registration_attendance
  FOR INSERT
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY registration_attendance_tenant_update ON registration_attendance
  FOR UPDATE
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT SELECT ON registration_attendance TO camp_app;

GRANT INSERT (
  id,
  organization_id,
  session_id,
  family_id,
  registration_id,
  attendance_date,
  status,
  checked_in_at,
  checked_out_at,
  pickup_name,
  note,
  recorded_by
) ON registration_attendance TO camp_app;

GRANT UPDATE (
  status,
  checked_in_at,
  checked_out_at,
  pickup_name,
  note,
  recorded_by,
  updated_at
) ON registration_attendance TO camp_app;
