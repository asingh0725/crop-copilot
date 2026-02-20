/**
 * Product Service
 *
 * Handles product search, comparison, and retrieval operations.
 * Extracted from /api/products routes.
 */

import { prisma } from '@/lib/prisma';
import { ProductType, Prisma } from '@prisma/client';
import { productCacheService } from '@/lib/cache/product-cache';

export interface SearchProductsParams {
  ids?: string[];
  search?: string;
  types?: ProductType[];
  crop?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'brand' | 'type' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchProductsResult {
  products: Array<{
    id: string;
    name: string;
    brand: string | null;
    type: ProductType;
    analysis: any;
    applicationRate: string | null;
    crops: string[];
    description: string | null;
    metadata: any;
    createdAt: string;
    updatedAt: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface GetProductParams {
  id: string;
  userId?: string;
}

export interface GetProductResult {
  id: string;
  name: string;
  brand: string | null;
  type: ProductType;
  analysis: any;
  applicationRate: string | null;
  crops: string[];
  description: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string;
  relatedProducts: Array<{
    id: string;
    name: string;
    brand: string | null;
    type: ProductType;
    analysis: any;
    crops: string[];
  }>;
  usedInRecommendations: number;
  recommendations: Array<{
    recommendationId: string;
    condition: string;
    crop: string | null;
    createdAt: string;
  }>;
}

export interface CompareProductsParams {
  productIds: string[];
}

export interface CompareProductsResult {
  products: Array<{
    id: string;
    name: string;
    brand: string | null;
    type: ProductType;
    analysis: any;
    applicationRate: string | null;
    crops: string[];
    description: string | null;
    compatibility: {
      allCrops: string[];
      uniqueCrops: string[];
      commonCrops: string[];
    };
  }>;
  comparison: {
    types: ProductType[];
    commonCrops: string[];
    productCount: number;
  };
}

/**
 * Search products with filters, sorting, and pagination
 */
export async function searchProducts(
  params: SearchProductsParams
): Promise<SearchProductsResult> {
  const {
    ids = [],
    search = '',
    types = [],
    crop = '',
    limit = 20,
    offset = 0,
    sortBy = 'name',
    sortOrder = 'asc',
  } = params;

  // Validate and sanitize limit
  const sanitizedLimit = Math.min(limit, 100);

  // Build where clause
  const where: Prisma.ProductWhereInput = {};

  if (ids.length > 0) {
    where.id = { in: ids.slice(0, 100) };
  }

  // Search across name, brand, description
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { brand: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Filter by product type
  const validTypes = types.filter((t) => Object.values(ProductType).includes(t));
  if (validTypes.length > 0) {
    where.type = { in: validTypes };
  }

  // Filter by crop compatibility
  if (crop) {
    where.crops = { has: crop };
  }

  // Build orderBy clause
  let orderBy: Prisma.ProductOrderByWithRelationInput = { name: 'asc' };
  if (sortBy === 'brand') {
    orderBy = { brand: sortOrder === 'desc' ? 'desc' : 'asc' };
  } else if (sortBy === 'name') {
    orderBy = { name: sortOrder === 'desc' ? 'desc' : 'asc' };
  } else if (sortBy === 'type') {
    orderBy = { type: sortOrder === 'desc' ? 'desc' : 'asc' };
  } else if (sortBy === 'createdAt') {
    orderBy = { createdAt: sortOrder === 'desc' ? 'desc' : 'asc' };
  }

  // Get total count
  const total = await prisma.product.count({ where });

  // Fetch products
  const products = await prisma.product.findMany({
    where,
    orderBy,
    skip: offset,
    take: sanitizedLimit,
  });

  // Transform response
  const transformedProducts = products.map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    type: product.type,
    analysis: product.analysis,
    applicationRate: product.applicationRate,
    crops: product.crops,
    description: product.description,
    metadata: product.metadata,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }));

  return {
    products: transformedProducts,
    total,
    limit: sanitizedLimit,
    offset,
  };
}

/**
 * Get a single product by ID with related products
 */
export async function getProduct(params: GetProductParams): Promise<GetProductResult> {
  const { id, userId } = params;
  const recommendationInclude = {
    where: userId
      ? {
          recommendation: {
            userId,
          },
        }
      : undefined,
    orderBy: {
      createdAt: 'desc' as const,
    },
    take: 8,
    select: {
      recommendationId: true,
      createdAt: true,
      recommendation: {
        select: {
          id: true,
          createdAt: true,
          diagnosis: true,
          input: {
            select: {
              crop: true,
            },
          },
        },
      },
    },
  };

  // Fetch product with all details
  let product = await prisma.product.findUnique({
    where: { id },
    include: {
      recommendations: recommendationInclude,
    },
  });

  if (!product) {
    const normalizedLookup = id.trim().replace(/[_-]+/g, ' ');
    const lookupVariants = Array.from(
      new Set([id.trim(), normalizedLookup].filter((value) => value.length > 0))
    );
    if (lookupVariants.length > 0) {
      product = await prisma.product.findFirst({
        where: {
          OR: lookupVariants.map((value) => ({
            name: {
              equals: value,
              mode: 'insensitive',
            },
          })),
        },
        include: {
          recommendations: recommendationInclude,
        },
      });
    }
  }

  if (!product) {
    throw new Error('Product not found');
  }

  // Get count of recommendations using this product
  const usedInRecommendations = product.recommendations.length;
  const recommendationRefs = product.recommendations.map((entry) => {
    const diagnosis = entry.recommendation.diagnosis as any;
    const condition =
      diagnosis?.diagnosis?.condition ??
      diagnosis?.condition ??
      'Recommendation';

    return {
      recommendationId: entry.recommendationId,
      condition,
      crop: entry.recommendation.input.crop,
      createdAt: entry.recommendation.createdAt.toISOString(),
    };
  });

  // Find related products (same type, different product)
  const relatedProducts = await prisma.product.findMany({
    where: {
      type: product.type,
      id: { not: product.id },
    },
    take: 4,
  });

  // Transform response
  const response = {
    id: product.id,
    name: product.name,
    brand: product.brand,
    type: product.type,
    analysis: product.analysis,
    applicationRate: product.applicationRate,
    crops: product.crops,
    description: product.description,
    metadata: product.metadata,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    relatedProducts: relatedProducts.map((rp) => ({
      id: rp.id,
      name: rp.name,
      brand: rp.brand,
      type: rp.type,
      analysis: rp.analysis,
      crops: rp.crops,
    })),
    usedInRecommendations,
    recommendations: recommendationRefs,
  };

  return response;
}

/**
 * Compare multiple products side-by-side
 */
export async function compareProducts(
  params: CompareProductsParams
): Promise<CompareProductsResult> {
  const { productIds } = params;

  // Validate input
  if (!Array.isArray(productIds) || productIds.length < 2 || productIds.length > 6) {
    throw new Error('Please provide between 2 and 6 product IDs to compare');
  }

  // Fetch products
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
    },
  });

  if (products.length !== productIds.length) {
    throw new Error('One or more products not found');
  }

  // Transform products for comparison
  const transformedProducts = products.map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    type: product.type,
    analysis: product.analysis,
    applicationRate: product.applicationRate,
    crops: product.crops,
    description: product.description,
  }));

  // Find common crops across all products
  const allCropSets = transformedProducts.map((p) => new Set(p.crops));
  const firstProductCrops = transformedProducts[0]?.crops || [];
  const commonCrops = firstProductCrops.filter((crop) =>
    allCropSets.every((set) => set.has(crop))
  );

  // Calculate unique crops for each product
  const productsWithUniqueCrops = transformedProducts.map((product) => {
    const otherCrops = new Set(
      transformedProducts
        .filter((p) => p.id !== product.id)
        .flatMap((p) => p.crops)
    );
    const uniqueCrops = product.crops.filter((crop) => !otherCrops.has(crop));

    return {
      ...product,
      compatibility: {
        allCrops: product.crops,
        uniqueCrops,
        commonCrops,
      },
    };
  });

  // Calculate overall comparison stats
  const allTypes = Array.from(new Set(transformedProducts.map((p) => p.type)));

  const comparison = {
    types: allTypes,
    commonCrops,
    productCount: transformedProducts.length,
  };

  return {
    products: productsWithUniqueCrops,
    comparison,
  };
}

export interface GetBatchPricingParams {
  productIds: string[];
  region?: string;
}

export interface GetBatchPricingResult {
  pricing: Array<{
    productId: string;
    productName: string;
    brand: string | null;
    pricing: {
      currency: string;
      retailPrice: number | null;
      wholesalePrice: number | null;
      unit: string | null;
      availability: string | null;
      lastUpdated: string | null;
    };
    offers: Array<{
      price: number | null;
      unit: string;
      retailer: string;
      url: string | null;
      region: string;
      lastUpdated: string;
    }>;
  }>;
  meta: {
    region: string;
    fetchedAt: string;
  };
}

/**
 * Get batch pricing information for multiple products
 */
export async function getBatchPricing(
  params: GetBatchPricingParams
): Promise<GetBatchPricingResult> {
  const { productIds, region } = params;

  // Validate input
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new Error('Please provide at least one product ID');
  }

  if (productIds.length > 50) {
    throw new Error('Maximum 50 products allowed per batch request');
  }

  // Fetch products with metadata that may contain fallback pricing.
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
    },
    select: {
      id: true,
      name: true,
      brand: true,
      metadata: true,
    },
  });

  const pricing = await Promise.all(
    products.map(async (product) => {
      const metadata = (product.metadata as any) || {};
      const pricingData = metadata.pricing || {};

      let offers: Array<{
        price: number | null;
        unit: string;
        retailer: string;
        url: string | null;
        region: string;
        lastUpdated: string;
      }> = [];

      try {
        const liveOffers = await productCacheService.getProductPricing(
          product.id,
          product.name,
          product.brand || undefined,
          region
        );

        offers = liveOffers.map((offer) => ({
          price: offer.price,
          unit: offer.unit || 'unit',
          retailer: offer.retailer || 'Retailer',
          url: offer.url ?? null,
          region: offer.region || region || 'United States',
          lastUpdated: offer.lastUpdated.toISOString(),
        }));
      } catch (error) {
        console.error(`Live pricing lookup failed for product ${product.id}:`, error);
      }

      const pricedOffers = offers
        .filter((offer) => typeof offer.price === 'number')
        .sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER));

      const bestOffer = pricedOffers[0];
      const secondOffer = pricedOffers[1];
      const fallbackUpdatedAt =
        typeof pricingData.lastUpdated === 'string' ? pricingData.lastUpdated : null;

      return {
        productId: product.id,
        productName: product.name,
        brand: product.brand,
        pricing: {
          currency: pricingData.currency || 'USD',
          retailPrice:
            bestOffer?.price ??
            (typeof pricingData.retailPrice === 'number' ? pricingData.retailPrice : null),
          wholesalePrice:
            secondOffer?.price ??
            (typeof pricingData.wholesalePrice === 'number' ? pricingData.wholesalePrice : null),
          unit: bestOffer?.unit ?? pricingData.unit ?? null,
          availability:
            offers.length > 0
              ? `${offers.length} retailer offer${offers.length > 1 ? 's' : ''}`
              : pricingData.availability || null,
          lastUpdated: bestOffer?.lastUpdated ?? fallbackUpdatedAt,
        },
        offers,
      };
    })
  );

  return {
    pricing,
    meta: {
      region: region || 'United States',
      fetchedAt: new Date().toISOString(),
    },
  };
}
