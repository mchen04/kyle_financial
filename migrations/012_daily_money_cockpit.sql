ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS starting_savings_cents bigint;

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_starting_savings_nonnegative;

ALTER TABLE plans
  ADD CONSTRAINT plans_starting_savings_nonnegative CHECK (
    starting_savings_cents IS NULL OR starting_savings_cents >= 0
  );

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS color_token text,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

UPDATE expenses
SET color_token = (ARRAY[
  'blue', 'teal', 'violet', 'amber', 'rose', 'cyan',
  'green', 'orange', 'indigo', 'pink', 'lime', 'slate'
])[(mod(sort_order, 12) + 12) % 12 + 1]
WHERE color_token IS NULL;

ALTER TABLE expenses
  ALTER COLUMN color_token SET NOT NULL;

ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_color_token;

ALTER TABLE expenses
  ADD CONSTRAINT expenses_color_token CHECK (color_token IN (
    'blue', 'teal', 'violet', 'amber', 'rose', 'cyan',
    'green', 'orange', 'indigo', 'pink', 'lime', 'slate'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS expenses_plan_id_id_idx
  ON expenses(plan_id, id);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  category_id uuid NOT NULL,
  amount_cents bigint NOT NULL,
  title text NOT NULL,
  note text,
  transaction_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transactions_category_plan_fk
    FOREIGN KEY (plan_id, category_id)
    REFERENCES expenses(plan_id, id),
  CONSTRAINT transactions_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT transactions_title_nonempty CHECK (length(btrim(title)) > 0),
  CONSTRAINT transactions_title_length CHECK (length(title) <= 100),
  CONSTRAINT transactions_note_length CHECK (
    note IS NULL OR length(note) <= 500
  )
);

CREATE INDEX IF NOT EXISTS transactions_plan_date_idx
  ON transactions(plan_id, transaction_date DESC, id);

CREATE INDEX IF NOT EXISTS transactions_plan_category_date_idx
  ON transactions(plan_id, category_id, transaction_date DESC, id);
