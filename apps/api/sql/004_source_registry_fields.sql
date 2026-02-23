-- Add ingestion scheduling fields to the Source table so the DB-backed
-- source registry can determine which sources are due for re-scraping.

ALTER TABLE "Source"
  ADD COLUMN IF NOT EXISTS priority          TEXT NOT NULL DEFAULT 'medium'
                                             CHECK (priority IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS "freshnessHours"  INT  NOT NULL DEFAULT 168,
  ADD COLUMN IF NOT EXISTS tags              JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "lastScrapedAt"   TIMESTAMPTZ;

-- Efficient query for "which sources are due?" sorted by staleness + priority
CREATE INDEX IF NOT EXISTS idx_source_scraping_due
  ON "Source" (
    priority,
    "lastScrapedAt" ASC NULLS FIRST
  )
  WHERE status NOT IN ('archived');
