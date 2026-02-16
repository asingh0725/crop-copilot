-- Async recommendation command + job tables for Aurora PostgreSQL

CREATE TABLE IF NOT EXISTS app_input_command (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_app_input_user_idempotency UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS app_recommendation_job (
  id UUID PRIMARY KEY,
  input_id UUID NOT NULL REFERENCES app_input_command (id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_recommendation_job_user
  ON app_recommendation_job (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_recommendation_job_input
  ON app_recommendation_job (input_id);
