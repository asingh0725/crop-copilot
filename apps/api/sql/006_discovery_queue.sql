-- Migration 006: crop × region discovery queue + MLModelVersion updatedAt fix
--
-- 1. MLModelVersion was missing the "updatedAt" column that the application code
--    already writes to (retrain-trigger.ts, endpoint-updater.ts). This ALTER is
--    idempotent via IF NOT EXISTS.
--
-- 2. CropRegionDiscovery tracks which (crop, region) pairs have been processed by
--    the automated Gemini source-discovery worker. Seeds are inserted by the worker
--    on its first run using ON CONFLICT DO NOTHING.

-- ── 1. Fix MLModelVersion ────────────────────────────────────────────────────

ALTER TABLE "MLModelVersion"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ;

-- ── 2. Crop × region discovery queue ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CropRegionDiscovery" (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  crop                TEXT        NOT NULL,
  region              TEXT        NOT NULL,
  -- pending   → not yet processed
  -- running   → currently being processed (guards against duplicate Lambda invocations)
  -- completed → Gemini search run; sourcesFound URLs registered
  -- error     → Gemini call failed; will be retried on next cycle
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'running', 'completed', 'error')),
  "sourcesFound"      INT         NOT NULL DEFAULT 0,
  "lastDiscoveredAt"  TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crop, region)
);

-- Efficient lookup for the worker: find pending rows, oldest-first
CREATE INDEX IF NOT EXISTS idx_crop_region_discovery_pending
  ON "CropRegionDiscovery" (status, "lastDiscoveredAt" ASC NULLS FIRST)
  WHERE status IN ('pending', 'error');
