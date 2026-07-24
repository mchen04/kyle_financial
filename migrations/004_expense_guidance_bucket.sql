ALTER TABLE expenses ADD COLUMN IF NOT EXISTS guidance_bucket text;

-- Only rows that predate the column are classified, so a replay can never
-- overwrite a bucket the owner chose deliberately.
UPDATE expenses
SET guidance_bucket = CASE
  WHEN lower(trim(category_group)) IN (
    'investing', 'investment', 'investments', 'retirement', 'saving',
    'savings', 'brokerage', 'emergency fund', '401(k)', '401k'
  ) THEN 'saving'
  WHEN lower(trim(category_group)) IN (
    'needs', 'need', 'home', 'housing', 'everyday', 'utilities',
    'transportation', 'transport', 'medical', 'healthcare', 'insurance',
    'food', 'groceries', 'childcare', 'debt', 'debt payments', 'mortgage',
    'property tax', 'education', 'rent & utilities', 'dining & groceries'
  ) THEN 'needs'
  ELSE 'wants'
END
WHERE guidance_bucket IS NULL;

ALTER TABLE expenses ALTER COLUMN guidance_bucket SET DEFAULT 'wants';
ALTER TABLE expenses ALTER COLUMN guidance_bucket SET NOT NULL;

ALTER TABLE expenses
DROP CONSTRAINT IF EXISTS expenses_guidance_bucket_check;
ALTER TABLE expenses
DROP CONSTRAINT IF EXISTS expenses_guidance_bucket;
ALTER TABLE expenses
ADD CONSTRAINT expenses_guidance_bucket
CHECK (guidance_bucket IN ('needs', 'wants', 'saving'));
