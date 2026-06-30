ALTER TABLE programs
  ADD COLUMN default_minimum_grade integer NOT NULL DEFAULT 0,
  ADD COLUMN default_maximum_grade integer NOT NULL DEFAULT 12,
  ADD CONSTRAINT program_default_minimum_grade_valid CHECK (
    default_minimum_grade BETWEEN 0 AND 12
  ),
  ADD CONSTRAINT program_default_maximum_grade_valid CHECK (
    default_maximum_grade BETWEEN 0 AND 12
  ),
  ADD CONSTRAINT program_default_grades_valid CHECK (
    default_minimum_grade <= default_maximum_grade
  );

UPDATE programs
SET default_minimum_grade = CASE
      WHEN code = 'HS' OR code = 'WIN' OR name ILIKE '%high school%' THEN 9
      WHEN code = 'JH' OR name ILIKE '%junior high%' OR name ILIKE '%jr high%' THEN 6
      WHEN code = 'ELEM' OR name ILIKE '%elementary%' THEN 2
      ELSE 0
    END,
    default_maximum_grade = CASE
      WHEN code = 'HS' OR code = 'WIN' OR name ILIKE '%high school%' THEN 12
      WHEN code = 'JH' OR name ILIKE '%junior high%' OR name ILIKE '%jr high%' THEN 8
      WHEN code = 'ELEM' OR name ILIKE '%elementary%' THEN 5
      WHEN code = 'DAY' OR delivery_mode = 'DAY' THEN 5
      ELSE 12
    END;

GRANT INSERT (
  default_minimum_grade,
  default_maximum_grade
) ON programs TO camp_app;

GRANT UPDATE (
  default_minimum_grade,
  default_maximum_grade
) ON programs TO camp_app;
