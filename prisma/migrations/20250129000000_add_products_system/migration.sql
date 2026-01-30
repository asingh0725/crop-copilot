-- CreateEnum (safe - only creates if doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductType') THEN
    CREATE TYPE "ProductType" AS ENUM ('FERTILIZER', 'AMENDMENT', 'PESTICIDE', 'HERBICIDE', 'FUNGICIDE', 'INSECTICIDE', 'SEED_TREATMENT', 'BIOLOGICAL', 'OTHER');
  END IF;
END $$;

-- AlterTable Product - Add new columns only (no deletions)
ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "analysis" JSONB,
ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
ADD COLUMN IF NOT EXISTS "category" TEXT,
ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Add crops column if it doesn't exist
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "crops" TEXT[];

-- Copy data from targetCrops to crops if targetCrops exists and crops is empty
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Product' AND column_name = 'targetCrops') THEN
    UPDATE "Product" SET "crops" = "targetCrops" WHERE "crops" IS NULL OR "crops" = '{}';
  END IF;
END $$;

-- Alter type column to use enum (if it's currently text) - preserves data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Product' AND column_name = 'type' AND data_type = 'text') THEN
    -- First set any NULL or invalid values to 'OTHER'
    UPDATE "Product" SET "type" = 'OTHER' WHERE "type" IS NULL OR "type" NOT IN ('FERTILIZER', 'AMENDMENT', 'PESTICIDE', 'HERBICIDE', 'FUNGICIDE', 'INSECTICIDE', 'SEED_TREATMENT', 'BIOLOGICAL', 'OTHER');
    ALTER TABLE "Product" ALTER COLUMN "type" TYPE "ProductType" USING "type"::"ProductType";
  END IF;
EXCEPTION
  WHEN others THEN
    NULL;
END $$;

-- AlterTable ProductPrice - Add new columns only if table exists (no deletions)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ProductPrice') THEN
    ALTER TABLE "ProductPrice" ADD COLUMN IF NOT EXISTS "inStock" BOOLEAN DEFAULT true;
    ALTER TABLE "ProductPrice" ADD COLUMN IF NOT EXISTS "lastUpdated" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

    -- Copy data from fetchedAt to lastUpdated if fetchedAt exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ProductPrice' AND column_name = 'fetchedAt') THEN
      UPDATE "ProductPrice" SET "lastUpdated" = "fetchedAt" WHERE "lastUpdated" IS NULL;
    END IF;
  END IF;
END $$;

-- CreateTable ProductRecommendation (safe - only creates if doesn't exist)
CREATE TABLE IF NOT EXISTS "ProductRecommendation" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "applicationRate" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProductRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for Product (safe - IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "Product_type_idx" ON "Product"("type");
CREATE INDEX IF NOT EXISTS "Product_brand_idx" ON "Product"("brand");

-- CreateIndex for ProductPrice (safe - only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ProductPrice') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ProductPrice_productId_retailer_key') THEN
      -- Only create unique index if no duplicates exist
      IF NOT EXISTS (
        SELECT "productId", "retailer" FROM "ProductPrice"
        GROUP BY "productId", "retailer" HAVING COUNT(*) > 1
      ) THEN
        CREATE UNIQUE INDEX "ProductPrice_productId_retailer_key" ON "ProductPrice"("productId", "retailer");
      END IF;
    END IF;
    CREATE INDEX IF NOT EXISTS "ProductPrice_productId_idx" ON "ProductPrice"("productId");
  END IF;
END $$;

-- CreateIndex for ProductRecommendation (safe - IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS "ProductRecommendation_recommendationId_productId_key" ON "ProductRecommendation"("recommendationId", "productId");
CREATE INDEX IF NOT EXISTS "ProductRecommendation_recommendationId_idx" ON "ProductRecommendation"("recommendationId");
CREATE INDEX IF NOT EXISTS "ProductRecommendation_productId_idx" ON "ProductRecommendation"("productId");

-- AddForeignKey (safe - checks for existing constraint)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ProductRecommendation_recommendationId_fkey') THEN
    ALTER TABLE "ProductRecommendation" ADD CONSTRAINT "ProductRecommendation_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ProductRecommendation_productId_fkey') THEN
    ALTER TABLE "ProductRecommendation" ADD CONSTRAINT "ProductRecommendation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
