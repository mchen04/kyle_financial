CREATE TABLE IF NOT EXISTS auth_rate_limits (
  scope text NOT NULL,
  key_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL,
  PRIMARY KEY (scope, key_hash),
  CONSTRAINT auth_rate_limits_scope_known CHECK (scope IN (
    'login:ip', 'login:identity', 'signup:ip', 'signup:identity'
  )),
  CONSTRAINT auth_rate_limits_key_hash_sha256 CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_rate_limits_attempt_count_positive CHECK (attempt_count > 0)
);

CREATE INDEX IF NOT EXISTS auth_rate_limits_window_started_at_idx
  ON auth_rate_limits(window_started_at);
