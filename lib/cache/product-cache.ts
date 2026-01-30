import { prisma } from "@/lib/prisma";
import { productCache, pricingCache } from "./redis-cache";
import {
  searchRecommendedProducts,
  ProductSearchResult,
} from "@/lib/ai/product-search";
import {
  searchProductPricing as searchPricingWithGemini,
  ProductPricing,
} from "@/lib/ai/pricing-search";
import { ProductType } from "@prisma/client";

// Re-export ProductPricing for consumers
export type { ProductPricing } from "@/lib/ai/pricing-search";

// Types for cached data
export interface CachedProductRecommendation {
  id: string;
  productId: string;
  product: {
    id: string;
    name: string;
    brand: string | null;
    type: ProductType;
    analysis: Record<string, unknown> | null;
    applicationRate: string | null;
    crops: string[];
    description: string | null;
  };
  reason: string;
  applicationRate: string | null;
  priority: number;
  searchQuery: string | null;
  searchTimestamp: Date;
}

export interface ProductWithPricing {
  id: string;
  name: string;
  brand: string | null;
  type: ProductType;
  analysis: Record<string, unknown> | null;
  applicationRate: string | null;
  crops: string[];
  description: string | null;
  pricing: ProductPricing[];
}

// Cache keys
function getRecommendationProductsKey(recommendationId: string): string {
  return `rec:${recommendationId}:products`;
}

function getProductPricingKey(productId: string): string {
  return `product:${productId}:pricing`;
}

/**
 * Multi-tier cache service for product recommendations
 * Tier 1: Redis (30 min TTL)
 * Tier 2: Database (persistent)
 * Tier 3: LLM web search (on-demand)
 */
export class ProductCacheService {
  /**
   * Get product recommendations for a recommendation
   * Follows: Redis → Database → LLM fallback
   */
  async getProductRecommendations(
    recommendationId: string,
    diagnosisText: string,
    crop?: string,
    location?: string
  ): Promise<CachedProductRecommendation[]> {
    // Tier 1: Try Redis cache
    const cacheKey = getRecommendationProductsKey(recommendationId);
    const cached = await productCache.get<CachedProductRecommendation[]>(
      cacheKey
    );
    if (cached && cached.length > 0) {
      console.log(`[Cache] Redis hit for recommendation ${recommendationId}`);
      return cached;
    }

    // Tier 2: Try Database
    const dbProducts = await this.getFromDatabase(recommendationId);
    if (dbProducts.length > 0) {
      console.log(
        `[Cache] Database hit for recommendation ${recommendationId}`
      );
      // Repopulate Redis cache
      await productCache.set(cacheKey, dbProducts);
      return dbProducts;
    }

    // Tier 3: LLM web search
    console.log(`[Cache] Cache miss - searching via LLM for ${recommendationId}`);
    const searchResults = await searchRecommendedProducts({
      diagnosis: diagnosisText,
      crop,
      location,
      maxProducts: 3,
    });

    // Store in database and cache
    const storedProducts = await this.storeSearchResults(
      recommendationId,
      searchResults
    );

    // Cache in Redis
    await productCache.set(cacheKey, storedProducts);

    return storedProducts;
  }

  /**
   * Get product pricing with caching (using Gemini)
   * Follows: Redis → Gemini web search fallback
   *
   * @param productId - Product ID for caching
   * @param productName - Product name to search for
   * @param brand - Optional brand name
   * @param region - User's region for localized pricing (e.g., "Texas, USA")
   */
  async getProductPricing(
    productId: string,
    productName: string,
    brand?: string,
    region?: string
  ): Promise<ProductPricing[]> {
    // Include region in cache key for location-specific pricing
    const regionKey = region ? `:${region.toLowerCase().replace(/\s+/g, "-")}` : "";
    const cacheKey = `${getProductPricingKey(productId)}${regionKey}`;

    // Tier 1: Try Redis cache
    const cached = await pricingCache.get<ProductPricing[]>(cacheKey);
    if (cached && cached.length > 0) {
      console.log(`[Pricing] Redis hit for product ${productId} (${region || "default"})`);
      return cached;
    }

    // Tier 2: Gemini web search for pricing
    console.log(`[Pricing] Fetching live pricing for ${productName} in ${region || "United States"}`);
    const pricing = await searchPricingWithGemini({
      productName,
      brand,
      region: region || "United States",
      maxResults: 5,
    });

    // Cache in Redis (1 hour TTL)
    if (pricing.length > 0) {
      await pricingCache.set(cacheKey, pricing);
    }

    return pricing;
  }

  /**
   * Get product recommendations from database
   */
  private async getFromDatabase(
    recommendationId: string
  ): Promise<CachedProductRecommendation[]> {
    const productRecs = await prisma.productRecommendation.findMany({
      where: { recommendationId },
      include: {
        product: true,
      },
      orderBy: { priority: "asc" },
    });

    return productRecs.map((pr) => ({
      id: pr.id,
      productId: pr.productId,
      product: {
        id: pr.product.id,
        name: pr.product.name,
        brand: pr.product.brand,
        type: pr.product.type,
        analysis: pr.product.analysis as Record<string, unknown> | null,
        applicationRate: pr.product.applicationRate,
        crops: pr.product.crops,
        description: pr.product.description,
      },
      reason: pr.reason,
      applicationRate: pr.applicationRate,
      priority: pr.priority,
      searchQuery: pr.searchQuery,
      searchTimestamp: pr.searchTimestamp,
    }));
  }

  /**
   * Store LLM search results in database
   */
  private async storeSearchResults(
    recommendationId: string,
    results: ProductSearchResult[]
  ): Promise<CachedProductRecommendation[]> {
    const storedProducts: CachedProductRecommendation[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];

      // Create or find product
      let product = await prisma.product.findFirst({
        where: {
          name: result.name,
          brand: result.brand,
        },
      });

      if (!product) {
        product = await prisma.product.create({
          data: {
            name: result.name,
            brand: result.brand,
            type: result.type,
            analysis: result.analysis ?? undefined,
            applicationRate: result.applicationRate,
            crops: result.crops,
            description: result.description,
          },
        });
      }

      // Create product recommendation link
      const productRec = await prisma.productRecommendation.upsert({
        where: {
          recommendationId_productId: {
            recommendationId,
            productId: product.id,
          },
        },
        create: {
          recommendationId,
          productId: product.id,
          reason: this.generateReason(result),
          applicationRate: result.applicationRate,
          priority: i + 1,
          searchQuery: result.searchQuery,
          searchTimestamp: new Date(),
        },
        update: {
          reason: this.generateReason(result),
          applicationRate: result.applicationRate,
          priority: i + 1,
          searchQuery: result.searchQuery,
          searchTimestamp: new Date(),
        },
        include: {
          product: true,
        },
      });

      storedProducts.push({
        id: productRec.id,
        productId: productRec.productId,
        product: {
          id: productRec.product.id,
          name: productRec.product.name,
          brand: productRec.product.brand,
          type: productRec.product.type,
          analysis: productRec.product.analysis as Record<
            string,
            unknown
          > | null,
          applicationRate: productRec.product.applicationRate,
          crops: productRec.product.crops,
          description: productRec.product.description,
        },
        reason: productRec.reason,
        applicationRate: productRec.applicationRate,
        priority: productRec.priority,
        searchQuery: productRec.searchQuery,
        searchTimestamp: productRec.searchTimestamp,
      });
    }

    return storedProducts;
  }

  /**
   * Generate a reason string from product search result
   */
  private generateReason(result: ProductSearchResult): string {
    const parts: string[] = [];

    if (result.description) {
      parts.push(result.description);
    } else {
      parts.push(`${result.name} is a ${result.type.toLowerCase().replace("_", " ")}.`);
    }

    if (result.crops.length > 0) {
      parts.push(`Suitable for: ${result.crops.join(", ")}.`);
    }

    return parts.join(" ");
  }

  /**
   * Invalidate cache for a recommendation
   */
  async invalidateRecommendation(recommendationId: string): Promise<void> {
    const cacheKey = getRecommendationProductsKey(recommendationId);
    await productCache.delete(cacheKey);
  }

  /**
   * Invalidate pricing cache for a product
   */
  async invalidatePricing(productId: string): Promise<void> {
    const cacheKey = getProductPricingKey(productId);
    await pricingCache.delete(cacheKey);
  }

  /**
   * Refresh product recommendations (force LLM search)
   */
  async refreshProductRecommendations(
    recommendationId: string,
    diagnosisText: string,
    crop?: string,
    location?: string
  ): Promise<CachedProductRecommendation[]> {
    // Invalidate existing cache
    await this.invalidateRecommendation(recommendationId);

    // Delete existing product recommendations from database
    await prisma.productRecommendation.deleteMany({
      where: { recommendationId },
    });

    // Fetch fresh results
    return this.getProductRecommendations(
      recommendationId,
      diagnosisText,
      crop,
      location
    );
  }
}

// Singleton instance
export const productCacheService = new ProductCacheService();
