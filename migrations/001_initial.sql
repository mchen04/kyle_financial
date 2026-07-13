CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email))),
  CONSTRAINT users_email_nonempty CHECK (length(email) > 3)
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  state_code text NOT NULL,
  filing_status text NOT NULL,
  gross_salary_cents bigint NOT NULL DEFAULT 0,
  additional_income_cents bigint NOT NULL DEFAULT 0,
  hsa_coverage text NOT NULL DEFAULT 'self',
  field_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plans_user_year_unique UNIQUE (user_id, year),
  CONSTRAINT plans_year_range CHECK (year BETWEEN 2000 AND 2200),
  CONSTRAINT plans_state_code CHECK (state_code ~ '^[A-Z]{2}$'),
  CONSTRAINT plans_filing_status CHECK (filing_status IN ('single', 'mfj', 'hoh')),
  CONSTRAINT plans_hsa_coverage CHECK (hsa_coverage IN ('self', 'family')),
  CONSTRAINT plans_gross_nonnegative CHECK (gross_salary_cents >= 0),
  CONSTRAINT plans_additional_nonnegative CHECK (additional_income_cents >= 0)
);

CREATE INDEX IF NOT EXISTS plans_user_updated_idx ON plans(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  type text NOT NULL,
  label text NOT NULL,
  amount_kind text NOT NULL,
  amount_value bigint NOT NULL DEFAULT 0,
  discount_rate_ppm integer,
  custom_tax_treatment jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  field_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT benefits_type CHECK (type IN (
    'traditional401k', 'roth401k', 'employer401kMatch', 'espp', 'hsa',
    'employerHsa', 'healthFsa', 'dependentCareFsa', 'section125Premium',
    'commuter', 'lifeDisabilityInsurance', 'custom'
  )),
  CONSTRAINT benefits_amount_kind CHECK (amount_kind IN ('percent', 'fixedAnnual', 'fixedMonthly')),
  CONSTRAINT benefits_amount_nonnegative CHECK (amount_value >= 0),
  CONSTRAINT benefits_discount_range CHECK (discount_rate_ppm IS NULL OR discount_rate_ppm BETWEEN 0 AND 1000000),
  CONSTRAINT benefits_custom_treatment CHECK ((type = 'custom') = (custom_tax_treatment IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS benefits_plan_sort_idx ON benefits(plan_id, sort_order, id);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  name text NOT NULL,
  category_group text NOT NULL,
  cadence text NOT NULL,
  amount_cents bigint NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  field_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_name_nonempty CHECK (length(btrim(name)) > 0),
  CONSTRAINT expenses_group_nonempty CHECK (length(btrim(category_group)) > 0),
  CONSTRAINT expenses_cadence CHECK (cadence IN ('monthly', 'yearly')),
  CONSTRAINT expenses_amount_nonnegative CHECK (amount_cents >= 0)
);

CREATE INDEX IF NOT EXISTS expenses_plan_sort_idx ON expenses(plan_id, sort_order, id);

CREATE TABLE IF NOT EXISTS applied_mutations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mutation_id text NOT NULL,
  result jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mutation_id),
  CONSTRAINT applied_mutations_id_nonempty CHECK (length(mutation_id) > 0)
);

CREATE INDEX IF NOT EXISTS applied_mutations_applied_idx
  ON applied_mutations(user_id, applied_at DESC);

