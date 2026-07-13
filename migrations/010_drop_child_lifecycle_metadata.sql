ALTER TABLE benefits
  DROP COLUMN IF EXISTS field_versions,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE expenses
  DROP COLUMN IF EXISTS field_versions,
  DROP COLUMN IF EXISTS updated_at;
