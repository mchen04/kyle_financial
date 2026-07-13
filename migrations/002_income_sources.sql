ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS spouse_wage_income_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_ordinary_income_cents bigint NOT NULL DEFAULT 0;

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_spouse_wages_nonnegative,
  DROP CONSTRAINT IF EXISTS plans_other_income_nonnegative;

ALTER TABLE plans
  ADD CONSTRAINT plans_spouse_wages_nonnegative
    CHECK (spouse_wage_income_cents >= 0),
  ADD CONSTRAINT plans_other_income_nonnegative
    CHECK (other_ordinary_income_cents >= 0);
