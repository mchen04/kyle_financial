WITH ranked_receipts AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY user_id, lower(mutation_id)
      ORDER BY applied_at DESC, mutation_id
    ) AS alias_rank
  FROM applied_mutations
  WHERE mutation_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
DELETE FROM applied_mutations
WHERE ctid IN (
  SELECT ctid FROM ranked_receipts WHERE alias_rank > 1
);

UPDATE applied_mutations
SET mutation_id = lower(mutation_id)
WHERE mutation_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND mutation_id <> lower(mutation_id);
