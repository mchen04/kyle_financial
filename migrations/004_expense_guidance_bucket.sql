ALTER TABLE expenses
ADD COLUMN guidance_bucket text NOT NULL DEFAULT 'wants'
CHECK (guidance_bucket IN ('needs', 'wants', 'saving'));

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
END;
