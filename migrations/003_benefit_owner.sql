ALTER TABLE benefits
  ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'primary';

ALTER TABLE benefits
  DROP CONSTRAINT IF EXISTS benefits_owner;

ALTER TABLE benefits
  ADD CONSTRAINT benefits_owner CHECK (owner IN ('primary', 'spouse'));
