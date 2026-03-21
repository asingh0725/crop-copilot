-- Feedback-triggered training + cross-pipeline observability

CREATE TABLE IF NOT EXISTS "PipelineEventLog" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline TEXT NOT NULL,
  stage TEXT NOT NULL,
  severity TEXT NOT NULL
    CHECK (severity IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  "runId" TEXT,
  "sourceId" TEXT,
  "recommendationId" TEXT,
  "userId" TEXT,
  url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_event_log_recent
  ON "PipelineEventLog" ("createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_event_log_pipeline
  ON "PipelineEventLog" (pipeline, "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_event_log_severity
  ON "PipelineEventLog" (severity, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ModelTrainingTrigger" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "modelType" TEXT NOT NULL
    CHECK ("modelType" IN ('lambdarank', 'premium_quality')),
  "feedbackId" UUID,
  "recommendationId" TEXT,
  "userId" TEXT,
  source TEXT NOT NULL DEFAULT 'feedback_submit',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'skipped', 'failed')),
  reason TEXT,
  "errorMessage" TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  "processedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_training_trigger_model_feedback
  ON "ModelTrainingTrigger" ("modelType", "feedbackId")
  WHERE "feedbackId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_model_training_trigger_status
  ON "ModelTrainingTrigger" (status, "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_model_training_trigger_model_status
  ON "ModelTrainingTrigger" ("modelType", status, "createdAt" DESC);
