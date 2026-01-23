import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { searchTextChunks, searchImageChunks } from "@/lib/retrieval/search";
import { assembleContext } from "@/lib/retrieval/context-assembly";
import { generateWithRetry, ValidationError } from "@/lib/validation/retry";

const requestSchema = z.object({
  inputId: z.string().cuid(),
});

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
    const query = buildQuery(input);

    // Retrieve relevant chunks
    const textResults = await searchTextChunks(query, 5);
    const imageResults = await searchImageChunks(query, 3);

    // Assemble context
    const context = await assembleContext(textResults, imageResults);

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
      crop: (input.labData as any)?.crop || undefined,
      location: input.user.profile?.location || undefined,
    };

    // Generate recommendation with retry logic
    const recommendation = await generateWithRetry(normalizedInput, context);

    // Store recommendation in database
    const savedRecommendation = await prisma.recommendation.create({
      data: {
        userId: user.id,
        inputId: input.id,
        diagnosis: recommendation.diagnosis,
        confidence: recommendation.confidence,
        modelUsed: "claude-3-5-sonnet-20241022",
      },
    });

    // Store source links
    await Promise.all(
      recommendation.sources.map((source) =>
        prisma.recommendationSource.create({
          data: {
            recommendationId: savedRecommendation.id,
            textChunkId: source.chunkId,
            relevanceScore: source.relevance,
          },
        })
      )
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
        { error: "Invalid request", details: error.errors },
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

/**
 * Build search query from input
 */
function buildQuery(input: any): string {
  const parts: string[] = [];

  if (input.description) {
    parts.push(input.description);
  }

  if (input.labData) {
    const labData = input.labData as any;
    if (labData.crop) parts.push(`Crop: ${labData.crop}`);
    if (labData.symptoms) parts.push(`Symptoms: ${labData.symptoms}`);
    if (labData.soilPh) parts.push(`pH: ${labData.soilPh}`);
  }

  return parts.join(". ");
}
