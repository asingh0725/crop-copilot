-- Migration: add ingestion scheduling fields to Source
--
-- The API ingestion workers (run-ingestion-batch, process-ingestion-batch,
-- discover-sources) require these four columns on the Source table.
-- They were previously only added via apps/api/sql/004_source_registry_fields.sql
-- which is outside Prisma's migration system. This migration brings the Prisma
-- schema into sync so deployments via `prisma migrate deploy` include them.
--
-- All statements are idempotent (IF NOT EXISTS) so re-running against a DB
-- that already has the columns from the raw SQL migration is safe.

ALTER TABLE "Source"
  ADD COLUMN IF NOT EXISTS "priority"       TEXT        NOT NULL DEFAULT 'medium'
                                            CHECK ("priority" IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS "freshnessHours" INTEGER     NOT NULL DEFAULT 168,
  ADD COLUMN IF NOT EXISTS "tags"           JSONB       NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "lastScrapedAt"  TIMESTAMPTZ;

-- Index used by listDueSources to efficiently find un-scraped / stale sources
CREATE INDEX IF NOT EXISTS idx_source_scraping_due
  ON "Source" ("priority", "lastScrapedAt" ASC NULLS FIRST)
  WHERE status NOT IN ('archived');
