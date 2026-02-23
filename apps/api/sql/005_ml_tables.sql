-- Implicit user feedback events (view time, product clicks, re-diagnosis).
CREATE TABLE IF NOT EXISTS "UserEvent" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"    TEXT NOT NULL,
  type        TEXT NOT NULL,       -- recommendation_viewed | product_clicked | rediagnosed
  payload     JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_event_user
  ON "UserEvent" ("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_user_event_type
  ON "UserEvent" (type, "createdAt" DESC);

-- Per-(source, topic) quality scores to avoid penalising a good nitrogen
-- source because it was irrelevant for a pest query.
CREATE TABLE IF NOT EXISTS "SourceTopicAffinity" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sourceId"    TEXT NOT NULL,
  topic         TEXT NOT NULL,
  boost         FLOAT8 NOT NULL DEFAULT 0,
  "sampleCount" INT    NOT NULL DEFAULT 0,
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("sourceId", topic)
);

CREATE INDEX IF NOT EXISTS idx_source_topic_affinity_source
  ON "SourceTopicAffinity" ("sourceId");

-- ML model version registry for automated retraining decisions.
CREATE TABLE IF NOT EXISTS "MLModelVersion" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "modelType"     TEXT NOT NULL DEFAULT 'lambdarank',
  "trainedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "feedbackCount" INT NOT NULL DEFAULT 0,
  "ndcgScore"     FLOAT8,
  "s3Uri"         TEXT,
  status          TEXT NOT NULL DEFAULT 'training', -- training | deployed | retired
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_model_version_type
  ON "MLModelVersion" ("modelType", "trainedAt" DESC);
