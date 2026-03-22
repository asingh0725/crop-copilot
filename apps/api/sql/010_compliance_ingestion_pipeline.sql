-- Compliance ingestion pipeline foundation
-- Automated discovery -> ingestion -> chunking -> fact extraction -> coverage

CREATE TABLE IF NOT EXISTS "ComplianceSource" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'regulatory',
  jurisdiction TEXT NOT NULL DEFAULT 'US',
  state TEXT,
  crop TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'parsed', 'chunked', 'embedded', 'indexed', 'error')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high', 'medium', 'low')),
  "freshnessHours" INT NOT NULL DEFAULT 24,
  tags JSONB NOT NULL DEFAULT '[]',
  etag TEXT,
  "lastModified" TEXT,
  "contentHash" TEXT,
  "lastFetchedAt" TIMESTAMPTZ,
  "lastIndexedAt" TIMESTAMPTZ,
  "chunksCount" INT NOT NULL DEFAULT 0,
  "factsCount" INT NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_source_due
  ON "ComplianceSource" (priority, "lastFetchedAt" ASC NULLS FIRST)
  WHERE status IN ('pending', 'error', 'indexed');

CREATE INDEX IF NOT EXISTS idx_compliance_source_geo
  ON "ComplianceSource" (jurisdiction, state, crop, status);

CREATE TABLE IF NOT EXISTS "ComplianceDiscoveryQueue" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL,
  crop TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'error')),
  "sourcesFound" INT NOT NULL DEFAULT 0,
  "lastDiscoveredAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (state, crop)
);

CREATE INDEX IF NOT EXISTS idx_compliance_discovery_pending
  ON "ComplianceDiscoveryQueue" (status, "lastDiscoveredAt" ASC NULLS FIRST)
  WHERE status IN ('pending', 'error');

CREATE TABLE IF NOT EXISTS "ComplianceIngestionRun" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (trigger IN ('scheduled', 'manual', 'discovery')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  "sourcesQueued" INT NOT NULL DEFAULT 0,
  "sourcesProcessed" INT NOT NULL DEFAULT 0,
  "chunksCreated" INT NOT NULL DEFAULT 0,
  "factsExtracted" INT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "endedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_ingestion_run_recent
  ON "ComplianceIngestionRun" ("startedAt" DESC);

CREATE TABLE IF NOT EXISTS "ComplianceChunk" (
  id TEXT PRIMARY KEY,
  "complianceSourceId" UUID NOT NULL REFERENCES "ComplianceSource"(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector,
  metadata JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_chunk_source
  ON "ComplianceChunk" ("complianceSourceId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ComplianceFact" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "complianceSourceId" UUID NOT NULL REFERENCES "ComplianceSource"(id) ON DELETE CASCADE,
  "chunkId" TEXT,
  "factType" TEXT NOT NULL,
  "factKey" TEXT NOT NULL,
  "factValue" TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  metadata JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_fact_lookup
  ON "ComplianceFact" ("factType", "factKey", "complianceSourceId");

CREATE INDEX IF NOT EXISTS idx_compliance_fact_geo
  ON "ComplianceFact" ("createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ComplianceCoverage" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction TEXT NOT NULL DEFAULT 'US',
  state TEXT,
  crop TEXT,
  "sourceCount" INT NOT NULL DEFAULT 0,
  "factCount" INT NOT NULL DEFAULT 0,
  "coverageScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "freshnessHours" INT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (jurisdiction, state, crop)
);

CREATE INDEX IF NOT EXISTS idx_compliance_coverage_score
  ON "ComplianceCoverage" ("coverageScore" DESC, "updatedAt" DESC);
