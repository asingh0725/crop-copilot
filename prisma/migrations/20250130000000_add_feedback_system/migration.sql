-- Safe Migration: Add Comprehensive Feedback System
-- This migration ONLY adds new columns and tables, never drops existing data
-- All new columns are nullable or have defaults for safety

-- ============================================
-- Step 1: Add new columns to Feedback table
-- (Preserves all existing data and columns)
-- ============================================

-- Add rating column (overall 1-5 stars)
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "rating" INTEGER;

-- Add accuracy column (diagnosis accuracy 1-5 stars)
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "accuracy" INTEGER;

-- Add issues column (JSON array of issue strings)
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "issues" JSONB;

-- Add outcome tracking columns
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "outcomeReported" BOOLEAN DEFAULT false;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "outcomeApplied" BOOLEAN;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "outcomeSuccess" BOOLEAN;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "outcomeNotes" TEXT;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "outcomeImages" TEXT[] DEFAULT '{}';
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "outcomeTimestamp" TIMESTAMP(3);

-- Add metadata columns for learning
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "promptVersion" TEXT;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "retrievedChunks" JSONB;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "suggestedProducts" JSONB;

-- Add updatedAt column
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Migrate existing data: copy accuracyRating to accuracy if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Feedback' AND column_name = 'accuracyRating') THEN
    UPDATE "Feedback" SET "accuracy" = "accuracyRating" WHERE "accuracy" IS NULL AND "accuracyRating" IS NOT NULL;
  END IF;
END $$;

-- Make userId nullable (for anonymous feedback)
ALTER TABLE "Feedback" ALTER COLUMN "userId" DROP NOT NULL;

-- ============================================
-- Step 2: Add indexes to Feedback table
-- ============================================

CREATE INDEX IF NOT EXISTS "Feedback_helpful_idx" ON "Feedback"("helpful");
CREATE INDEX IF NOT EXISTS "Feedback_rating_idx" ON "Feedback"("rating");
CREATE INDEX IF NOT EXISTS "Feedback_outcomeReported_idx" ON "Feedback"("outcomeReported");
CREATE INDEX IF NOT EXISTS "Feedback_outcomeSuccess_idx" ON "Feedback"("outcomeSuccess");
CREATE INDEX IF NOT EXISTS "Feedback_promptVersion_idx" ON "Feedback"("promptVersion");
CREATE INDEX IF NOT EXISTS "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- Add unique constraint on recommendationId if it doesn't exist
-- (One feedback per recommendation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Feedback_recommendationId_key'
  ) THEN
    -- Only add if no duplicates exist
    IF NOT EXISTS (
      SELECT "recommendationId" FROM "Feedback"
      GROUP BY "recommendationId" HAVING COUNT(*) > 1
    ) THEN
      ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_recommendationId_key" UNIQUE ("recommendationId");
    END IF;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add unique constraint on recommendationId - duplicates may exist';
END $$;

-- ============================================
-- Step 3: Create PromptTemplate table
-- ============================================

CREATE TABLE IF NOT EXISTS "PromptTemplate" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateText" TEXT NOT NULL,
    "averageRating" DOUBLE PRECISION,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "learnings" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "trafficPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "notes" TEXT,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PromptTemplate_version_key" ON "PromptTemplate"("version");
CREATE INDEX IF NOT EXISTS "PromptTemplate_isActive_idx" ON "PromptTemplate"("isActive");

-- ============================================
-- Step 4: Create ChunkFeedbackScore table
-- ============================================

CREATE TABLE IF NOT EXISTS "ChunkFeedbackScore" (
    "id" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "positiveCount" INTEGER NOT NULL DEFAULT 0,
    "negativeCount" INTEGER NOT NULL DEFAULT 0,
    "neutralCount" INTEGER NOT NULL DEFAULT 0,
    "feedbackScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "timesRetrieved" INTEGER NOT NULL DEFAULT 0,
    "lastUsed" TIMESTAMP(3),
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChunkFeedbackScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChunkFeedbackScore_chunkId_key" ON "ChunkFeedbackScore"("chunkId");
CREATE INDEX IF NOT EXISTS "ChunkFeedbackScore_feedbackScore_idx" ON "ChunkFeedbackScore"("feedbackScore");
CREATE INDEX IF NOT EXISTS "ChunkFeedbackScore_timesRetrieved_idx" ON "ChunkFeedbackScore"("timesRetrieved");

-- ============================================
-- Step 5: Create ProductFeedbackScore table
-- ============================================

CREATE TABLE IF NOT EXISTS "ProductFeedbackScore" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "diagnosisType" TEXT NOT NULL,
    "cropType" TEXT NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "partialCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductFeedbackScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductFeedbackScore_productId_diagnosisType_cropType_key"
ON "ProductFeedbackScore"("productId", "diagnosisType", "cropType");
CREATE INDEX IF NOT EXISTS "ProductFeedbackScore_successRate_idx" ON "ProductFeedbackScore"("successRate");
CREATE INDEX IF NOT EXISTS "ProductFeedbackScore_diagnosisType_idx" ON "ProductFeedbackScore"("diagnosisType");
CREATE INDEX IF NOT EXISTS "ProductFeedbackScore_cropType_idx" ON "ProductFeedbackScore"("cropType");

-- Add foreign key to Product table (safe - checks if constraint exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ProductFeedbackScore_productId_fkey'
  ) THEN
    ALTER TABLE "ProductFeedbackScore"
    ADD CONSTRAINT "ProductFeedbackScore_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add foreign key constraint - Product table may not exist yet';
END $$;

-- ============================================
-- Verification: This migration does NOT:
-- - Drop any existing columns
-- - Drop any existing tables
-- - Delete any existing data
-- - Modify existing data (except copying accuracyRating to accuracy)
-- ============================================
