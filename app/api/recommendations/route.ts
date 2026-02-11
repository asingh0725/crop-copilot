import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import {
  searchTextChunks,
  searchImageChunks,
  fetchRequiredTextChunks,
} from "@/lib/retrieval/search";
import { assembleContext } from "@/lib/retrieval/context-assembly";
import { buildRetrievalPlan } from "@/lib/retrieval/query";
import { resolveSourceHints } from "@/lib/retrieval/source-hints";
import { generateWithRetry, ValidationError } from "@/lib/validation/retry";
import { Prisma } from "@prisma/client";
import { CLAUDE_MODEL } from "@/lib/ai/claude";

const requestSchema = z.object({
  inputId: z.string().cuid(),
});

/**
 * GET /api/recommendations - List user's recommendations
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const sort = searchParams.get("sort") || "date_desc";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

    // Build where clause
    const where: Prisma.RecommendationWhereInput = {
      userId: user.id,
    };

    // Search by crop or condition (in diagnosis JSON)
    if (search) {
      where.OR = [
        {
          input: {
            crop: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          diagnosis: {
            path: ["diagnosis", "condition"],
            string_contains: search,
          },
        },
      ];
    }

    // Build orderBy
    let orderBy: Prisma.RecommendationOrderByWithRelationInput = { createdAt: "desc" };
    switch (sort) {
      case "date_asc":
        orderBy = { createdAt: "asc" };
        break;
      case "date_desc":
        orderBy = { createdAt: "desc" };
        break;
      case "confidence_high":
        orderBy = { confidence: "desc" };
        break;
      case "confidence_low":
        orderBy = { confidence: "asc" };
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
        condition: diagnosis?.diagnosis?.condition || "Unknown",
        conditionType: diagnosis?.diagnosis?.conditionType || "unknown",
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

    return NextResponse.json({
      recommendations: formattedRecommendations,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("List recommendations error:", error);
    return NextResponse.json(
      { error: "Failed to list recommendations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Validate authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { inputId } = requestSchema.parse(body);

    console.log("Generating recommendation:", {
      inputId,
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    // Fetch input from database
    const input = await prisma.input.findUnique({
      where: { id: inputId },
      include: { user: { include: { profile: true } } },
    });

    if (!input) {
      return NextResponse.json({ error: "Input not found" }, { status: 404 });
    }

    // Verify input belongs to authenticated user
    if (input.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      return NextResponse.json(
        {
          error: "No relevant knowledge found",
          details: "Unable to find context for this input",
        },
        { status: 422 }
      );
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

    const existingRecommendation = await prisma.recommendation.findUnique({
      where: { inputId: input.id },
    });

    if (existingRecommendation) {
      return NextResponse.json({
        id: existingRecommendation.id,
        recommendation: {
          diagnosis: existingRecommendation.diagnosis,
          confidence: existingRecommendation.confidence,
        },
        metadata: {
          reused: true,
        },
      });
    }
    // Generate recommendation with retry logic
    const recommendation = await generateWithRetry(normalizedInput, context);

    // Store recommendation in database
    // Note: diagnosis field stores the full recommendation output (diagnosis + recommendations + products)
    const savedRecommendation = await prisma.recommendation.create({
      data: {
        userId: user.id,
        inputId: input.id,
        diagnosis: recommendation as any, // Store full recommendation object
        confidence: recommendation.confidence,
        modelUsed: CLAUDE_MODEL,
      },
    });

    // Store source links
    await Promise.all(
      recommendation.sources.map(async (source) => {
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

    const latency = Date.now() - startTime;

    console.log("Recommendation generated successfully:", {
      recommendationId: savedRecommendation.id,
      latencyMs: latency,
    });

    return NextResponse.json({
      id: savedRecommendation.id,
      recommendation,
      metadata: {
        latencyMs: latency,
        chunksUsed: context.totalChunks,
        tokensUsed: context.totalTokens,
      },
    });
  } catch (error) {
    const latency = Date.now() - startTime;

    console.error("Recommendation generation failed:", {
      error,
      latencyMs: latency,
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof ValidationError) {
      return NextResponse.json(
        {
          error: "Recommendation validation failed",
          details: error.details,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate recommendation" },
      { status: 500 }
    );
  }
}
