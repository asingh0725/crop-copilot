import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  recommendationId: z.string(),
  helpful: z.boolean().optional(),
  rating: z.number().min(1).max(5).optional(),
  accuracy: z.number().min(1).max(5).optional(),
  comments: z.string().optional(),
  issues: z.array(z.string()).optional(),
});

/**
 * POST /api/feedback
 * Submit feedback for a recommendation
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validated = feedbackSchema.parse(body);

    // Get recommendation to extract metadata
    const recommendation = await prisma.recommendation.findUnique({
      where: { id: validated.recommendationId },
      include: {
        products: {
          select: { productId: true },
        },
        sources: {
          select: { textChunkId: true, imageChunkId: true },
        },
      },
    });

    if (!recommendation) {
      return NextResponse.json(
        { error: "Recommendation not found" },
        { status: 404 }
      );
    }

    // Verify user owns this recommendation
    if (recommendation.userId !== user.id) {
      return NextResponse.json(
        { error: "You can only provide feedback on your own recommendations" },
        { status: 403 }
      );
    }

    // Extract metadata for learning
    const retrievedChunks = recommendation.sources
      .map((s) => s.textChunkId || s.imageChunkId)
      .filter(Boolean);
    const suggestedProducts = recommendation.products.map((p) => p.productId);

    // Create or update feedback
    const feedback = await prisma.feedback.upsert({
      where: {
        recommendationId: validated.recommendationId,
      },
      create: {
        recommendationId: validated.recommendationId,
        userId: user.id,
        helpful: validated.helpful,
        rating: validated.rating,
        accuracy: validated.accuracy,
        comments: validated.comments,
        issues: validated.issues,
        retrievedChunks,
        suggestedProducts,
      },
      update: {
        helpful: validated.helpful ?? undefined,
        rating: validated.rating ?? undefined,
        accuracy: validated.accuracy ?? undefined,
        comments: validated.comments ?? undefined,
        issues: validated.issues ?? undefined,
        updatedAt: new Date(),
      },
    });

    // Update chunk feedback scores if rating provided
    if (validated.rating && retrievedChunks.length > 0) {
      await updateChunkScores(retrievedChunks as string[], validated.rating);
    }

    return NextResponse.json({ success: true, feedback });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }

    console.error("Error submitting feedback:", error);
    return NextResponse.json(
      { error: "Failed to submit feedback" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/feedback?recommendationId=xxx
 * Get existing feedback for a recommendation
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const recommendationId = searchParams.get("recommendationId");

    if (!recommendationId) {
      return NextResponse.json(
        { error: "recommendationId is required" },
        { status: 400 }
      );
    }

    const feedback = await prisma.feedback.findUnique({
      where: { recommendationId },
    });

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}

/**
 * Update chunk feedback scores based on rating
 */
async function updateChunkScores(chunkIds: string[], rating: number) {
  const isPositive = rating >= 4;
  const isNegative = rating <= 2;
  const isNeutral = rating === 3;

  for (const chunkId of chunkIds) {
    try {
      await prisma.chunkFeedbackScore.upsert({
        where: { chunkId },
        create: {
          chunkId,
          positiveCount: isPositive ? 1 : 0,
          negativeCount: isNegative ? 1 : 0,
          neutralCount: isNeutral ? 1 : 0,
          feedbackScore: isPositive ? 1.0 : isNegative ? 0.0 : 0.5,
          timesRetrieved: 1,
          lastUsed: new Date(),
        },
        update: {
          positiveCount: isPositive ? { increment: 1 } : undefined,
          negativeCount: isNegative ? { increment: 1 } : undefined,
          neutralCount: isNeutral ? { increment: 1 } : undefined,
          timesRetrieved: { increment: 1 },
          lastUsed: new Date(),
        },
      });

      // Recalculate feedback score
      const scores = await prisma.chunkFeedbackScore.findUnique({
        where: { chunkId },
      });

      if (scores) {
        const total =
          scores.positiveCount + scores.negativeCount + scores.neutralCount;
        const feedbackScore =
          total > 0
            ? (scores.positiveCount + scores.neutralCount * 0.5) / total
            : 0.5;

        await prisma.chunkFeedbackScore.update({
          where: { chunkId },
          data: { feedbackScore },
        });
      }
    } catch (error) {
      console.error(`Error updating chunk score for ${chunkId}:`, error);
    }
  }
}
