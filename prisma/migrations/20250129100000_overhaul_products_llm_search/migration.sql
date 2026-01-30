-- Safe Migration: Overhaul Products System for LLM Web Search
-- This migration ONLY touches Product, ProductPrice, and ProductRecommendation tables
-- All other tables (User, Input, Recommendation, TextChunk, etc.) are NOT affected

-- Step 1: Drop ProductPrice table (pricing now fetched via LLM web search)
DROP TABLE IF EXISTS "ProductPrice" CASCADE;

-- Step 2: Remove unused columns from Product table
ALTER TABLE "Product" DROP COLUMN IF EXISTS "imageUrl";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "category";

-- Step 3: Make brand optional (allow NULL)
ALTER TABLE "Product" ALTER COLUMN "brand" DROP NOT NULL;

-- Step 4: Drop old brand index, create new name index (if not exists)
DROP INDEX IF EXISTS "Product_brand_idx";
CREATE INDEX IF NOT EXISTS "Product_name_idx" ON "Product"("name");

-- Step 5: Add new columns to ProductRecommendation (if not exist)
ALTER TABLE "ProductRecommendation" ADD COLUMN IF NOT EXISTS "searchQuery" TEXT;
ALTER TABLE "ProductRecommendation" ADD COLUMN IF NOT EXISTS "searchTimestamp" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ProductRecommendation" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Verify: This migration does NOT touch:
-- - User, UserProfile, Input, Recommendation, Feedback
-- - Source, TextChunk, ImageChunk, RecommendationSource
-- - Any other non-products tables
