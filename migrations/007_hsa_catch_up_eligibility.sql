ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS primary_hsa_catch_up_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS spouse_hsa_catch_up_eligible boolean NOT NULL DEFAULT false;
