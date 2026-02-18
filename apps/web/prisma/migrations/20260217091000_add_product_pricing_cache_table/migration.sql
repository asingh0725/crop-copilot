CREATE TABLE "ProductPricingCache" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "pricing" JSONB NOT NULL,
  "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductPricingCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductPricingCache_productId_region_key"
ON "ProductPricingCache"("productId", "region");

CREATE INDEX "ProductPricingCache_productId_idx"
ON "ProductPricingCache"("productId");

CREATE INDEX "ProductPricingCache_expiresAt_idx"
ON "ProductPricingCache"("expiresAt");

ALTER TABLE "ProductPricingCache"
ADD CONSTRAINT "ProductPricingCache_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
