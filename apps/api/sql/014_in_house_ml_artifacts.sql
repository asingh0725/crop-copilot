-- Migration 014: in-house ML artifact registry

ALTER TABLE "MLModelVersion"
  ADD COLUMN IF NOT EXISTS backend TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS artifact JSONB,
  ADD COLUMN IF NOT EXISTS metrics JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE "MLModelVersion"
SET backend = CASE
  WHEN backend = 'legacy' AND "s3Uri" IS NOT NULL THEN 'sagemaker_legacy'
  ELSE backend
END
WHERE backend = 'legacy';

CREATE INDEX IF NOT EXISTS idx_ml_model_version_type_status
  ON "MLModelVersion" ("modelType", status, "trainedAt" DESC);
