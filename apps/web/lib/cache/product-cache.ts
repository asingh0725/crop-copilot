import { prisma } from "@/lib/prisma";
import {
  searchRecommendedProducts,
  ProductSearchResult,
} from "@/lib/ai/product-search";
import {
  searchProductPricing as searchPricingWithGemini,
  ProductPricing,
} from "@/lib/ai/pricing-search";
import { Prisma, ProductType } from "@prisma/client";

export type { ProductPricing } from "@/lib/ai/pricing-search";

const MAX_PRODUCTS = 3;
const LIVE_PRODUCT_SEARCH_TIMEOUT_MS = 12000;
const PRICING_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

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

export class ProductCacheService {
  async getProductRecommendations(
    recommendationId: string
  ): Promise<CachedProductRecommendation[]> {
    const dbProducts = await this.getFromDatabase(recommendationId);
    if (dbProducts.length > 0) {
      console.log(`[Products] Database cache hit for recommendation ${recommendationId}`);
      return dbProducts;
    }

    console.log(
      `[Products] No precomputed recommendations stored for ${recommendationId}`
    );
    return [];
  }

  async getProductPricing(
    productId: string,
    productName: string,
    brand?: string,
    region?: string
  ): Promise<ProductPricing[]> {
    const regionLabel = region || "United States";
    const regionKey = this.normalizeRegionKey(regionLabel);

    const cachedPricing = await this.getPricingFromDatabaseCache(
      productId,
      regionKey
    );
    if (cachedPricing.length > 0) {
      console.log(`[Pricing] Database cache hit for product ${productId} (${regionKey})`);
      return cachedPricing;
    }

    console.log(`[Pricing] Fetching live pricing for ${productName} in ${regionLabel}`);
    const pricing = await searchPricingWithGemini({
      productName,
      brand,
      region: regionLabel,
      maxResults: 5,
    });

    if (pricing.length > 0) {
      await this.storePricingInDatabaseCache(productId, regionKey, pricing);
    }

    return pricing;
  }

  async invalidateRecommendation(recommendationId: string): Promise<void> {
    await prisma.productRecommendation.deleteMany({
      where: { recommendationId },
    });
  }

  async invalidatePricing(productId: string): Promise<void> {
    await prisma.productPricingCache.deleteMany({
      where: { productId },
    });
  }

  async refreshProductRecommendations(
    recommendationId: string,
    diagnosisText: string,
    crop?: string,
    location?: string
  ): Promise<CachedProductRecommendation[]> {
    await this.invalidateRecommendation(recommendationId);

    const liveResults = await this.searchLiveProductsWithTimeout({
      diagnosis: diagnosisText,
      crop,
      location,
      maxProducts: MAX_PRODUCTS,
    });

    if (liveResults.length > 0) {
      return this.storeSearchResults(recommendationId, liveResults);
    }

    const catalogFallback = await this.getCatalogFallbackSearchResults(
      diagnosisText,
      crop
    );
    if (catalogFallback.length === 0) {
      return [];
    }

    return this.storeSearchResults(recommendationId, catalogFallback);
  }

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

  private async storeSearchResults(
    recommendationId: string,
    results: ProductSearchResult[]
  ): Promise<CachedProductRecommendation[]> {
    const storedProducts: CachedProductRecommendation[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];

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
          analysis: productRec.product.analysis as Record<string, unknown> | null,
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

  private async getCatalogFallbackSearchResults(
    diagnosisText: string,
    crop?: string
  ): Promise<ProductSearchResult[]> {
    const candidateTypes = inferProductTypesFromDiagnosis(diagnosisText);
    const normalizedCrop = crop?.trim().toLowerCase();

    const where: Prisma.ProductWhereInput = {};
    if (candidateTypes.length > 0) {
      where.type = { in: candidateTypes };
    }
    if (normalizedCrop) {
      where.OR = [{ crops: { has: normalizedCrop } }, { crops: { isEmpty: true } }];
    }

    let catalogProducts = await prisma.product.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: MAX_PRODUCTS,
    });

    if (catalogProducts.length === 0 && normalizedCrop) {
      catalogProducts = await prisma.product.findMany({
        where: candidateTypes.length > 0 ? { type: { in: candidateTypes } } : {},
        orderBy: [{ updatedAt: "desc" }],
        take: MAX_PRODUCTS,
      });
    }

    return catalogProducts.map((product) => ({
      name: product.name,
      brand: product.brand,
      type: product.type,
      analysis: product.analysis as Record<string, number | string> | null,
      applicationRate: product.applicationRate,
      crops: product.crops,
      description: product.description,
      searchQuery: `catalog-fallback:${diagnosisText.trim().slice(0, 140)}`,
    }));
  }

  private async searchLiveProductsWithTimeout(
    options: {
      diagnosis: string;
      crop?: string;
      location?: string;
      maxProducts: number;
    }
  ): Promise<ProductSearchResult[]> {
    let timeoutReached = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const searchPromise = searchRecommendedProducts(options).catch((error) => {
      console.error("[Products] Live search failed:", error);
      return [];
    });

    const timeoutPromise = new Promise<ProductSearchResult[]>((resolve) => {
      timeoutHandle = setTimeout(() => {
        timeoutReached = true;
        resolve([]);
      }, LIVE_PRODUCT_SEARCH_TIMEOUT_MS);
    });

    const results = await Promise.race([searchPromise, timeoutPromise]);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    if (timeoutReached) {
      console.warn(
        `[Products] Live search timed out after ${LIVE_PRODUCT_SEARCH_TIMEOUT_MS}ms`
      );
    }

    return results.slice(0, MAX_PRODUCTS);
  }

  private generateReason(result: ProductSearchResult): string {
    const parts: string[] = [];

    if (result.description) {
      parts.push(result.description);
    } else {
      parts.push(
        `${result.name} is a ${result.type.toLowerCase().replace("_", " ")}.`
      );
    }

    if (result.crops.length > 0) {
      parts.push(`Suitable for: ${result.crops.join(", ")}.`);
    }

    return parts.join(" ");
  }

  private normalizeRegionKey(region: string): string {
    return region.trim().toLowerCase().replace(/\s+/g, " ");
  }

  private async getPricingFromDatabaseCache(
    productId: string,
    regionKey: string
  ): Promise<ProductPricing[]> {
    const cached = await prisma.productPricingCache.findUnique({
      where: {
        productId_region: {
          productId,
          region: regionKey,
        },
      },
      select: {
        pricing: true,
        expiresAt: true,
      },
    });

    if (!cached) {
      return [];
    }

    if (cached.expiresAt.getTime() <= Date.now()) {
      await prisma.productPricingCache
        .delete({
          where: {
            productId_region: {
              productId,
              region: regionKey,
            },
          },
        })
        .catch(() => undefined);
      return [];
    }

    return this.parsePricingFromJson(cached.pricing);
  }

  private async storePricingInDatabaseCache(
    productId: string,
    regionKey: string,
    pricing: ProductPricing[]
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PRICING_CACHE_TTL_MS);

    await prisma.productPricingCache.upsert({
      where: {
        productId_region: {
          productId,
          region: regionKey,
        },
      },
      create: {
        productId,
        region: regionKey,
        pricing: this.toPricingJson(pricing),
        cachedAt: now,
        expiresAt,
      },
      update: {
        pricing: this.toPricingJson(pricing),
        cachedAt: now,
        expiresAt,
      },
    });
  }

  private toPricingJson(pricing: ProductPricing[]): Prisma.InputJsonValue {
    return pricing.map((entry) => ({
      price: entry.price,
      unit: entry.unit,
      retailer: entry.retailer,
      url: entry.url,
      region: entry.region,
      lastUpdated: entry.lastUpdated.toISOString(),
    })) as Prisma.InputJsonValue;
  }

  private parsePricingFromJson(value: Prisma.JsonValue): ProductPricing[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return null;
        }

        const parsed = entry as Record<string, unknown>;
        const lastUpdatedRaw = parsed.lastUpdated;
        const parsedLastUpdated =
          typeof lastUpdatedRaw === "string" && !Number.isNaN(Date.parse(lastUpdatedRaw))
            ? new Date(lastUpdatedRaw)
            : new Date();

        return {
          price: typeof parsed.price === "number" ? parsed.price : null,
          unit: typeof parsed.unit === "string" ? parsed.unit : "each",
          retailer:
            typeof parsed.retailer === "string" ? parsed.retailer : "Unknown",
          url: typeof parsed.url === "string" ? parsed.url : null,
          region: typeof parsed.region === "string" ? parsed.region : "United States",
          lastUpdated: parsedLastUpdated,
        } satisfies ProductPricing;
      })
      .filter((entry): entry is ProductPricing => entry !== null);
  }
}

function inferProductTypesFromDiagnosis(diagnosisText: string): ProductType[] {
  const diagnosis = diagnosisText.toLowerCase();
  const inferred = new Set<ProductType>();

  if (/(fung|mildew|blight|rot|rust|spot)/.test(diagnosis)) {
    inferred.add("FUNGICIDE");
    inferred.add("BIOLOGICAL");
  }

  if (/(insect|aphid|beetle|worm|borer|mite|thrip|pest)/.test(diagnosis)) {
    inferred.add("INSECTICIDE");
    inferred.add("BIOLOGICAL");
  }

  if (/(weed|herbicide|grass pressure|broadleaf)/.test(diagnosis)) {
    inferred.add("HERBICIDE");
  }

  if (/(nutrient|deficien|chlorosis|yellowing|fertility|npk|nitrogen|phosphorus|potassium)/.test(diagnosis)) {
    inferred.add("FERTILIZER");
    inferred.add("AMENDMENT");
  }

  if (/(seedling|stand establishment|emergence|seed treatment)/.test(diagnosis)) {
    inferred.add("SEED_TREATMENT");
  }

  if (inferred.size === 0) {
    inferred.add("BIOLOGICAL");
    inferred.add("AMENDMENT");
    inferred.add("FERTILIZER");
  }

  return Array.from(inferred);
}

export const productCacheService = new ProductCacheService();
