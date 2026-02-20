/**
 * Recommendation Service
 *
 * Handles CRUD operations for recommendations.
 * Extracted from /api/recommendations and /api/recommendations/[id] routes.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { upsertRecommendationProductsFromDiagnosis } from '@/lib/services/recommendation-products';

export interface ListRecommendationsParams {
  userId: string;
  ids?: string[];
  search?: string;
  sort?: 'date_asc' | 'date_desc' | 'confidence_high' | 'confidence_low';
  page?: number;
  pageSize?: number;
}

export interface ListRecommendationsResult {
  recommendations: Array<{
    id: string;
    createdAt: Date;
    confidence: number;
    condition: string;
    conditionType: string;
    firstAction: string | null;
    input: {
      id: string;
      type: string;
      crop: string | null;
      location: string | null;
      imageUrl: string | null;
    };
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface GetRecommendationParams {
  userId: string;
  id: string;
}

export interface GetRecommendationResult {
  id: string;
  createdAt: Date;
  diagnosis: any;
  confidence: number;
  modelUsed: string;
  recommendedProducts: Array<{
    id: string;
    catalogProductId: string;
    productId: string;
    name: string;
    brand: string | null;
    type: string;
    reason: string | null;
    applicationRate: string | null;
    priority: number;
  }>;
  input: {
    id: string;
    type: string;
    description: string | null;
    imageUrl: string | null;
    labData: any;
    crop: string | null;
    location: string | null;
    season: string | null;
    createdAt: Date;
  };
  sources: Array<{
    id: string;
    chunkId: string | null;
    type: 'text' | 'image';
    content: string | null;
    imageUrl: string | null;
    relevanceScore: number | null;
    source: {
      id: string;
      title: string;
      type: string;
      url: string | null;
    } | null;
  }>;
}

function normalizeRecommendationDiagnosis(
  diagnosis: unknown,
  productRows: Array<{
    id: string;
    catalogProductId?: string;
    productId?: string;
    name: string;
    brand: string | null;
    type: string;
    reason: string | null;
    applicationRate: string | null;
    priority: number;
  }>
): Record<string, unknown> {
  const fallback: Record<string, unknown> = {
    diagnosis: {
      condition: 'Unknown condition',
      conditionType: 'unknown',
      confidence: 0,
      reasoning: 'No diagnostic reasoning was returned yet.',
    },
    recommendations: [],
    products: [],
    confidence: 0,
  };

  const parseStringified = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  };

  const base =
    diagnosis && typeof diagnosis === 'object'
      ? { ...(diagnosis as Record<string, unknown>) }
      : parseStringified(diagnosis) ?? fallback;

  const normalizeNameKey = (value: unknown): string => {
    if (typeof value !== 'string') return ''
    return value
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
  }

  const normalizeProductId = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
      return undefined
    }
    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }
    const lowered = trimmed.toLowerCase()
    if (lowered === 'null' || lowered === 'undefined') {
      return undefined
    }
    return trimmed
  }

  const catalogProducts = productRows.map((row) => ({
    productId: row.catalogProductId ?? row.productId ?? row.id,
    productName: row.name,
    productType: row.type,
    applicationRate: row.applicationRate,
    reasoning:
      row.reason ?? `Recommended for ${row.type.toLowerCase()} management.`,
    priority: row.priority,
    brand: row.brand,
  }))

  const catalogByName = new Map<string, (typeof catalogProducts)[number]>()
  for (const item of catalogProducts) {
    const key = normalizeNameKey(item.productName)
    if (!key || catalogByName.has(key)) continue
    catalogByName.set(key, item)
  }

  const existingProducts = Array.isArray(base.products)
    ? (base.products as Array<Record<string, unknown>>)
    : []

  const enrichedExisting = existingProducts.map((item) => {
    const nestedProduct =
      item.product && typeof item.product === 'object' && !Array.isArray(item.product)
        ? (item.product as Record<string, unknown>)
        : null
    const nestedProductName =
      typeof item.product === 'string' ? item.product : undefined
    const productName =
      item.productName ?? item.product_name ?? item.name
        ?? nestedProductName
        ?? nestedProduct?.name
    const key = normalizeNameKey(productName)
    const matched = key ? catalogByName.get(key) : undefined

    const productId =
      item.productId ??
      item.product_id ??
      item.catalogProductId ??
      item.catalog_product_id ??
      nestedProduct?.id

    return {
      ...item,
      productId:
        normalizeProductId(productId) ??
        matched?.productId ??
        undefined,
      productName:
        (typeof productName === 'string' && productName.trim().length > 0
          ? productName
          : undefined) ?? matched?.productName ?? 'Suggested product',
      productType:
        (typeof item.productType === 'string' && item.productType.length > 0
          ? item.productType
          : typeof item.product_type === 'string' && item.product_type.length > 0
            ? item.product_type
            : typeof nestedProduct?.type === 'string' && nestedProduct.type.length > 0
              ? nestedProduct.type
              : undefined) ?? matched?.productType ?? 'OTHER',
      applicationRate:
        (typeof item.applicationRate === 'string' && item.applicationRate.length > 0
          ? item.applicationRate
          : typeof item.application_rate === 'string' && item.application_rate.length > 0
            ? item.application_rate
            : typeof nestedProduct?.applicationRate === 'string' && nestedProduct.applicationRate.length > 0
              ? nestedProduct.applicationRate
              : typeof nestedProduct?.application_rate === 'string' && nestedProduct.application_rate.length > 0
                ? nestedProduct.application_rate
            : undefined) ?? matched?.applicationRate,
      reasoning:
        (typeof item.reasoning === 'string' && item.reasoning.length > 0
          ? item.reasoning
          : typeof item.reason === 'string' && item.reason.length > 0
            ? item.reason
            : undefined) ??
        matched?.reasoning ??
        'No product rationale provided.',
    }
  })

  const existingKeys = new Set(
    enrichedExisting
      .map((item) => normalizeNameKey(item.productName))
      .filter((key) => key.length > 0)
  )
  const missingCatalogProducts = catalogProducts.filter(
    (item) => !existingKeys.has(normalizeNameKey(item.productName))
  )

  base.products =
    existingProducts.length === 0
      ? catalogProducts
      : [...enrichedExisting, ...missingCatalogProducts]

  if (!Array.isArray(base.recommendations)) {
    base.recommendations = [];
  }

  return base;
}

function isGenericProductLabel(value: string | null | undefined): boolean {
  if (!value) return true
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
  return (
    normalized.length === 0 ||
    normalized === 'suggested product' ||
    normalized === 'unspecified' ||
    normalized === 'unknown product' ||
    normalized === 'product'
  )
}

function inferConditionType(conditionType: unknown, condition: string): string {
  if (
    conditionType === 'deficiency' ||
    conditionType === 'disease' ||
    conditionType === 'pest' ||
    conditionType === 'environmental' ||
    conditionType === 'unknown'
  ) {
    return conditionType;
  }

  const lowered = condition.toLowerCase();
  if (/(deficien|chlorosis|nutrient)/.test(lowered)) return 'deficiency';
  if (/(pest|insect|mite|aphid|worm|beetle|bug)/.test(lowered)) return 'pest';
  if (/(drought|heat|cold|frost|water|environment)/.test(lowered)) return 'environmental';
  if (/(disease|blight|rust|mold|fung|bacter|viral|pathogen)/.test(lowered)) return 'disease';
  return 'unknown';
}

/**
 * List recommendations for a user with search, sorting, and pagination
 */
export async function listRecommendations(
  params: ListRecommendationsParams
): Promise<ListRecommendationsResult> {
  const {
    userId,
    ids = [],
    search = '',
    sort = 'date_desc',
    page = 1,
    pageSize = 20,
  } = params;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(Math.floor(pageSize), 100)
      : 20

  // Build where clause
  const where: Prisma.RecommendationWhereInput = {
    userId,
  };

  if (ids.length > 0) {
    where.id = { in: ids.slice(0, 200) };
  }

  // Search by crop or condition (in diagnosis JSON)
  if (search) {
    where.OR = [
      {
        input: {
          crop: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        diagnosis: {
          path: ['diagnosis', 'condition'],
          string_contains: search,
        },
      },
    ];
  }

  // Build orderBy
  let orderBy: Prisma.RecommendationOrderByWithRelationInput = { createdAt: 'desc' };
  switch (sort) {
    case 'date_asc':
      orderBy = { createdAt: 'asc' };
      break;
    case 'date_desc':
      orderBy = { createdAt: 'desc' };
      break;
    case 'confidence_high':
      orderBy = { confidence: 'desc' };
      break;
    case 'confidence_low':
      orderBy = { confidence: 'asc' };
      break;
  }

  // Get total count
  const total = await prisma.recommendation.count({ where });

  // Get paginated results
  const recommendations = await prisma.recommendation.findMany({
    where,
    orderBy,
    skip: (safePage - 1) * safePageSize,
    take: safePageSize,
    include: {
      input: {
        select: {
          id: true,
          type: true,
          crop: true,
          location: true,
          imageUrl: true,
          createdAt: true,
        },
      },
    },
  });

  // Format response
  const formattedRecommendations = recommendations.map((rec) => {
    const diagnosis = rec.diagnosis as any;
    const condition =
      diagnosis?.diagnosis?.condition ??
      diagnosis?.condition ??
      'Unknown';
    return {
      id: rec.id,
      createdAt: rec.createdAt,
      confidence: rec.confidence,
      condition,
      conditionType: inferConditionType(
        diagnosis?.diagnosis?.conditionType ?? diagnosis?.conditionType,
        condition
      ),
      firstAction: diagnosis?.recommendations?.[0]?.action || null,
      input: {
        id: rec.input.id,
        type: rec.input.type,
        crop: rec.input.crop,
        location: rec.input.location,
        imageUrl: rec.input.imageUrl,
      },
    };
  });

  return {
    recommendations: formattedRecommendations,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    },
  };
}

/**
 * Get a single recommendation by ID or inputId
 */
export async function getRecommendation(
  params: GetRecommendationParams
): Promise<GetRecommendationResult> {
  const { userId, id } = params;

  // First try to find by recommendation ID
  let recommendation = await prisma.recommendation.findUnique({
    where: { id },
    include: {
      input: {
        include: {
          user: {
            include: {
              profile: true,
            },
          },
        },
      },
      sources: {
        include: {
          textChunk: {
            include: {
              source: true,
            },
          },
          imageChunk: {
            include: {
              source: true,
            },
          },
        },
      },
      products: {
        include: {
          product: true,
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });

  // If not found, try to find by input ID
  if (!recommendation) {
    recommendation = await prisma.recommendation.findUnique({
      where: { inputId: id },
      include: {
        input: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
        sources: {
          include: {
            textChunk: {
              include: {
                source: true,
              },
            },
            imageChunk: {
              include: {
                source: true,
              },
            },
          },
        },
        products: {
          include: {
            product: true,
          },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  if (!recommendation) {
    throw new Error('Recommendation not found');
  }

  if (recommendation.input.userId !== userId) {
    throw new Error('Forbidden: Recommendation does not belong to user');
  }

  type RecommendationProductRow = {
    reason: string | null
    applicationRate: string | null
    priority: number
    product: {
      id: string
      name: string
      brand: string | null
      type: string
    }
  }

  let productRows: RecommendationProductRow[] = recommendation.products.map((entry) => ({
    reason: entry.reason,
    applicationRate: entry.applicationRate,
    priority: entry.priority,
    product: {
      id: entry.product.id,
      name: entry.product.name,
      brand: entry.product.brand,
      type: entry.product.type,
    },
  }))

  const hasSpecificProductRow = productRows.some(
    (entry) => !isGenericProductLabel(entry.product?.name)
  )
  if (hasSpecificProductRow) {
    productRows = productRows.filter(
      (entry) => !isGenericProductLabel(entry.product?.name)
    )
  }

  const shouldBackfillProducts =
    productRows.length === 0 ||
    productRows.every((entry) => isGenericProductLabel(entry.product?.name))

  if (shouldBackfillProducts) {
    try {
      const backfilled = await upsertRecommendationProductsFromDiagnosis({
        recommendationId: recommendation.id,
        diagnosis: recommendation.diagnosis,
        crop: recommendation.input.crop,
      })
      if (backfilled.length > 0) {
        productRows = backfilled.map((entry) => ({
          reason: entry.reason,
          applicationRate: entry.applicationRate,
          priority: entry.priority,
          product: {
            id: entry.product.id,
            name: entry.product.name,
            brand: entry.product.brand,
            type: entry.product.type,
          },
        }))
      }
    } catch (error) {
      console.error('Recommendation product backfill failed:', error)
    }
  }

  const recommendedProducts = productRows.map((entry) => ({
    id: entry.product.id,
    catalogProductId: entry.product.id,
    productId: entry.product.id,
    name: entry.product.name,
    brand: entry.product.brand,
    type: entry.product.type,
    reason: entry.reason,
    applicationRate: entry.applicationRate,
    priority: entry.priority,
  }));
  const normalizedDiagnosis = normalizeRecommendationDiagnosis(
    recommendation.diagnosis,
    recommendedProducts
  );

  // Format response with all necessary data
  const response = {
    id: recommendation.id,
    createdAt: recommendation.createdAt,
    diagnosis: normalizedDiagnosis,
    confidence: recommendation.confidence,
    modelUsed: recommendation.modelUsed,
    recommendedProducts,
    input: {
      id: recommendation.input.id,
      type: recommendation.input.type,
      description: recommendation.input.description,
      imageUrl: recommendation.input.imageUrl,
      labData: recommendation.input.labData,
      crop: recommendation.input.crop,
      location: recommendation.input.location,
      season: recommendation.input.season,
      createdAt: recommendation.input.createdAt,
    },
    sources: recommendation.sources.map((source) => {
      const chunk = source.textChunk || source.imageChunk;
      const sourceDoc = chunk?.source;

      return {
        id: source.id,
        chunkId: source.textChunkId || source.imageChunkId,
        type: source.textChunkId ? 'text' as const : 'image' as const,
        content: source.textChunk?.content || source.imageChunk?.caption || null,
        imageUrl: source.imageChunk?.imageUrl || null,
        relevanceScore: source.relevanceScore,
        source: sourceDoc
          ? {
              id: sourceDoc.id,
              title: sourceDoc.title,
              type: sourceDoc.sourceType,
              url: sourceDoc.url,
            }
          : null,
      };
    }),
  };

  return response;
}

/**
 * Delete a recommendation
 */
export async function deleteRecommendation(
  params: GetRecommendationParams
): Promise<void> {
  const { userId, id } = params;

  // Find the recommendation
  const recommendation = await prisma.recommendation.findUnique({
    where: { id },
    include: {
      input: true,
    },
  });

  if (!recommendation) {
    throw new Error('Recommendation not found');
  }

  if (recommendation.input.userId !== userId) {
    throw new Error('Forbidden: Recommendation does not belong to user');
  }

  // Delete the recommendation (cascade deletes sources and feedback)
  await prisma.recommendation.delete({
    where: { id },
  });
}
