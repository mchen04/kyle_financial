ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS primary_hsa_eligible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS spouse_hsa_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS primary_hsa_family_allocation_ppm integer NOT NULL DEFAULT 1000000,
  ADD COLUMN IF NOT EXISTS spouse_hsa_family_allocation_ppm integer NOT NULL DEFAULT 0;

-- Preserve the legacy MFJ-family model, which always assumed two eligible
-- spouses and an equal allocation. New plans persist their explicit choices.
UPDATE plans
SET primary_hsa_eligible = true,
    spouse_hsa_eligible = true,
    primary_hsa_family_allocation_ppm = 500000,
    spouse_hsa_family_allocation_ppm = 500000
WHERE filing_status = 'mfj' AND hsa_coverage = 'family';

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_hsa_primary_allocation_range,
  DROP CONSTRAINT IF EXISTS plans_hsa_spouse_allocation_range;

ALTER TABLE plans
  ADD CONSTRAINT plans_hsa_primary_allocation_range
    CHECK (primary_hsa_family_allocation_ppm BETWEEN 0 AND 1000000),
  ADD CONSTRAINT plans_hsa_spouse_allocation_range
    CHECK (spouse_hsa_family_allocation_ppm BETWEEN 0 AND 1000000);
