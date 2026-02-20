/**
 * Diagnosis Service
 *
 * Handles input creation and recommendation generation logic.
 * Extracted from /api/inputs and /api/recommendations routes.
 */

import { prisma } from '@/lib/prisma';
import {
  searchTextChunks,
  searchImageChunks,
  fetchRequiredTextChunks,
} from '@/lib/retrieval/search';
import { assembleContext } from '@/lib/retrieval/context-assembly';
import { buildRetrievalPlan } from '@/lib/retrieval/query';
import { resolveSourceHints } from '@/lib/retrieval/source-hints';
import { generateWithRetry, ValidationError } from '@/lib/validation/retry';
import { CLAUDE_MODEL } from '@/lib/ai/claude';
import { logRetrievalAudit } from '@/lib/retrieval/audit';
import { upsertRecommendationProductsFromDiagnosis } from '@/lib/services/recommendation-products';

export interface CreateInputParams {
  userId: string;
  type: string;
  imageUrl?: string | null;
  description?: string | null;
  labData?: Record<string, any> | null;
  location?: string | null;
  crop?: string | null;
  season?: string | null;
}

export interface CreateInputResult {
  input: {
    id: string;
    userId: string;
    type: string;
    imageUrl: string | null;
    description: string | null;
    labData: any;
    location: string | null;
    crop: string | null;
    season: string | null;
    createdAt: Date;
  };
  recommendationId: string;
}

export interface GenerateRecommendationParams {
  userId: string;
  inputId: string;
}

export interface GenerateRecommendationResult {
  id: string;
  recommendation: any;
  metadata: {
    latencyMs?: number;
    chunksUsed?: number;
    tokensUsed?: number;
    reused?: boolean;
  };
}

export interface ListInputsParams {
  userId: string;
}

export interface GetInputByIdParams {
  userId: string;
  inputId: string;
}

/**
 * Create a new input and automatically generate a recommendation
 */
export async function createInput(
  params: CreateInputParams
): Promise<CreateInputResult> {
  const { userId, type, imageUrl, description, labData, location, crop, season } = params;

  // Create input in database
  const input = await prisma.input.create({
    data: {
      userId,
      type,
      imageUrl: imageUrl ?? undefined,
      description: description ?? undefined,
      labData: labData ?? undefined,
      location: location ?? undefined,
      crop: crop ?? undefined,
      season: season ?? undefined,
    },
  });

  // Generate recommendation immediately after creating input
  const plan = buildRetrievalPlan({
    description: input.description,
    labData: input.labData as Record<string, unknown> | null,
    crop: input.crop,
    location: input.location,
    growthStage: input.season,
    type: input.type,
  });

  const sourceHints = await resolveSourceHints(plan.sourceTitleHints);
  const searchOptions = {
    crop: input.crop ?? (input.labData as any)?.crop ?? undefined,
    region: input.location ?? undefined,
    topics: plan.topics,
    sourceBoosts: sourceHints.sourceBoosts,
  };

  const textResults = await searchTextChunks(plan.query, 5, searchOptions);
  const requiredText = await fetchRequiredTextChunks(
    plan.query,
    sourceHints.requiredSourceIds
  );
  const imageResults = await searchImageChunks(plan.query, 3, searchOptions);
  const context = await assembleContext(
    [...textResults, ...requiredText],
    imageResults,
    { requiredSourceIds: sourceHints.requiredSourceIds }
  );

  if (context.totalChunks === 0) {
    throw new ValidationError('No relevant knowledge found', {
      message: 'Unable to find context for this input',
      inputId: input.id,
    });
  }

  // Normalize input for agent
  const normalizedInput = {
    type: input.type,
    description: input.description || undefined,
    labData: input.labData || undefined,
    imageUrl: input.imageUrl || undefined,
    crop: input.crop ?? (input.labData as Record<string, unknown>)?.crop as string ?? undefined,
    location: input.location || undefined,
  };

  // Generate recommendation with retry logic
  const recommendation = await generateWithRetry(normalizedInput, context);

  // Store recommendation in database
  const savedRecommendation = await prisma.recommendation.create({
    data: {
      userId,
      inputId: input.id,
      diagnosis: recommendation as object,
      confidence: recommendation.confidence,
      modelUsed: CLAUDE_MODEL,
    },
  });

  // Store source links
  await Promise.all(
    recommendation.sources.map(async (source: any) => {
      const [textChunk, imageChunk] = await Promise.all([
        prisma.textChunk.findUnique({
          where: { id: source.chunkId },
          select: { id: true },
        }),
        prisma.imageChunk.findUnique({
          where: { id: source.chunkId },
          select: { id: true },
        }),
      ]);

      return prisma.recommendationSource.create({
        data: {
          recommendationId: savedRecommendation.id,
          textChunkId: textChunk ? source.chunkId : null,
          imageChunkId: imageChunk ? source.chunkId : null,
          relevanceScore: source.relevance,
        },
      });
    })
  );

  // Log retrieval audit (fire-and-forget)
  logRetrievalAudit({
    inputId: input.id,
    recommendationId: savedRecommendation.id,
    plan,
    requiredSourceIds: sourceHints.requiredSourceIds,
    textCandidates: [...textResults, ...requiredText].map((r) => ({
      id: r.id,
      similarity: r.similarity,
      sourceId: r.sourceId,
    })),
    imageCandidates: imageResults.map((r) => ({
      id: r.id,
      similarity: r.similarity,
      sourceId: r.sourceId,
    })),
    assembledChunkIds: context.chunks.map((c: any) => c.id),
    citedChunkIds: recommendation.sources.map((s: any) => s.chunkId),
  });

  // Backfill recommendation -> product links from model output when available.
  try {
    await upsertRecommendationProductsFromDiagnosis({
      recommendationId: savedRecommendation.id,
      diagnosis: recommendation,
      crop: input.crop,
    });
  } catch (error) {
    console.error('Product recommendation backfill failed (createInput):', error);
  }

  return {
    input,
    recommendationId: savedRecommendation.id,
  };
}

/**
 * Generate a recommendation for an existing input
 */
export async function generateRecommendation(
  params: GenerateRecommendationParams
): Promise<GenerateRecommendationResult> {
  const startTime = Date.now();
  const { userId, inputId } = params;

  // Fetch input from database
  const input = await prisma.input.findUnique({
    where: { id: inputId },
    include: { user: { include: { profile: true } } },
  });

  if (!input) {
    throw new Error('Input not found');
  }

  // Verify input belongs to authenticated user
  if (input.userId !== userId) {
    throw new Error('Forbidden: Input does not belong to user');
  }

  // Check if recommendation already exists
  const existingRecommendation = await prisma.recommendation.findUnique({
    where: { inputId: input.id },
  });

  if (existingRecommendation) {
    return {
      id: existingRecommendation.id,
      recommendation: {
        diagnosis: existingRecommendation.diagnosis,
        confidence: existingRecommendation.confidence,
      },
      metadata: {
        reused: true,
      },
    };
  }

  // Build query from input
  const plan = buildRetrievalPlan({
    description: input.description,
    labData: input.labData as Record<string, unknown> | null,
    crop: input.crop,
    location: input.location ?? input.user.profile?.location ?? null,
    growthStage: input.season,
    type: input.type,
  });

  // Retrieve relevant chunks
  const sourceHints = await resolveSourceHints(plan.sourceTitleHints);
  const searchOptions = {
    crop: input.crop ?? (input.labData as any)?.crop ?? undefined,
    region: input.location ?? input.user.profile?.location ?? undefined,
    topics: plan.topics,
    sourceBoosts: sourceHints.sourceBoosts,
  };
  const textResults = await searchTextChunks(plan.query, 5, searchOptions);
  const requiredText = await fetchRequiredTextChunks(
    plan.query,
    sourceHints.requiredSourceIds
  );
  const imageResults = await searchImageChunks(plan.query, 3, searchOptions);

  // Assemble context
  const context = await assembleContext(
    [...textResults, ...requiredText],
    imageResults,
    { requiredSourceIds: sourceHints.requiredSourceIds }
  );

  if (context.totalChunks === 0) {
    throw new ValidationError('No relevant knowledge found', {
      message: 'Unable to find context for this input',
    });
  }

  // Normalize input for agent
  const normalizedInput = {
    type: input.type,
    description: input.description || undefined,
    labData: input.labData || undefined,
    imageUrl: input.imageUrl || undefined,
    crop: input.crop ?? (input.labData as any)?.crop ?? undefined,
    location: input.location ?? input.user.profile?.location ?? undefined,
  };

  // Generate recommendation with retry logic
  const recommendation = await generateWithRetry(normalizedInput, context);

  // Store recommendation in database
  const savedRecommendation = await prisma.recommendation.create({
    data: {
      userId,
      inputId: input.id,
      diagnosis: recommendation as any,
      confidence: recommendation.confidence,
      modelUsed: CLAUDE_MODEL,
    },
  });

  // Store source links
  await Promise.all(
    recommendation.sources.map(async (source: any) => {
      const [textChunk, imageChunk] = await Promise.all([
        prisma.textChunk.findUnique({
          where: { id: source.chunkId },
          select: { id: true },
        }),
        prisma.imageChunk.findUnique({
          where: { id: source.chunkId },
          select: { id: true },
        }),
      ]);

      return prisma.recommendationSource.create({
        data: {
          recommendationId: savedRecommendation.id,
          textChunkId: textChunk ? source.chunkId : null,
          imageChunkId: imageChunk ? source.chunkId : null,
          relevanceScore: source.relevance,
        },
      });
    })
  );

  // Backfill recommendation -> product links from model output when available.
  try {
    await upsertRecommendationProductsFromDiagnosis({
      recommendationId: savedRecommendation.id,
      diagnosis: recommendation,
      crop: input.crop,
    });
  } catch (error) {
    console.error('Product recommendation backfill failed (generateRecommendation):', error);
  }

  const latency = Date.now() - startTime;

  return {
    id: savedRecommendation.id,
    recommendation,
    metadata: {
      latencyMs: latency,
      chunksUsed: context.totalChunks,
      tokensUsed: context.totalTokens,
    },
  };
}

/**
 * List all inputs for a user
 */
export async function listInputs(params: ListInputsParams) {
  const { userId } = params;

  const inputs = await prisma.input.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      recommendations: {
        select: { id: true },
      },
    },
  });

  return inputs;
}

/**
 * Get a specific input by ID
 */
export async function getInputById(params: GetInputByIdParams) {
  const { userId, inputId } = params;

  const input = await prisma.input.findUnique({
    where: { id: inputId },
    include: {
      recommendations: {
        select: { id: true },
      },
    },
  });

  if (!input) {
    throw new Error('Input not found');
  }

  if (input.userId !== userId) {
    throw new Error('Forbidden: Input does not belong to user');
  }

  return input;
}
