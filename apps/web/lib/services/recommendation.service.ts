/**
 * Recommendation Service
 *
 * Handles CRUD operations for recommendations.
 * Extracted from /api/recommendations and /api/recommendations/[id] routes.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export interface ListRecommendationsParams {
  userId: string;
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

/**
 * List recommendations for a user with search, sorting, and pagination
 */
export async function listRecommendations(
  params: ListRecommendationsParams
): Promise<ListRecommendationsResult> {
  const {
    userId,
    search = '',
    sort = 'date_desc',
    page = 1,
    pageSize = 20,
  } = params;

  // Build where clause
  const where: Prisma.RecommendationWhereInput = {
    userId,
  };

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
    skip: (page - 1) * pageSize,
    take: pageSize,
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
    return {
      id: rec.id,
      createdAt: rec.createdAt,
      confidence: rec.confidence,
      condition: diagnosis?.diagnosis?.condition || 'Unknown',
      conditionType: diagnosis?.diagnosis?.conditionType || 'unknown',
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
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
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
      },
    });
  }

  if (!recommendation) {
    throw new Error('Recommendation not found');
  }

  if (recommendation.input.userId !== userId) {
    throw new Error('Forbidden: Recommendation does not belong to user');
  }

  // Format response with all necessary data
  const response = {
    id: recommendation.id,
    createdAt: recommendation.createdAt,
    diagnosis: recommendation.diagnosis,
    confidence: recommendation.confidence,
    modelUsed: recommendation.modelUsed,
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
