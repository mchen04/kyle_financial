-- Receipt replay detection filters on `lower(mutation_id)`, which the
-- `(user_id, mutation_id)` primary key cannot serve. Without a matching
-- expression index the planner sequentially scans a table that grows for the
-- account lifetime, on every sync request.
CREATE INDEX IF NOT EXISTS applied_mutations_user_lower_id_idx
ON applied_mutations (user_id, lower(mutation_id));

-- Expired-bucket cleanup runs before every login and signup. Carrying `ctid`
-- through the CTE turns the delete into a tid lookup of the batch instead of a
-- hash join over the whole table.
CREATE INDEX IF NOT EXISTS auth_rate_limits_window_started_idx
ON auth_rate_limits (window_started_at);
