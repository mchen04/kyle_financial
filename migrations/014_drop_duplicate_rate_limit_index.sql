-- Migration 013 recreated an index that 011 already provides:
-- `auth_rate_limits_window_started_at_idx` and
-- `auth_rate_limits_window_started_idx` are both btree(window_started_at) on
-- the same table, so every login and signup paid to maintain two identical
-- indexes. Keep 011's, which is the original.
DROP INDEX IF EXISTS auth_rate_limits_window_started_idx;
