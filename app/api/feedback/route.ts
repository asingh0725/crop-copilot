import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { processLearningSignal } from "@/lib/learning/feedback-signal";

export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  recommendationId: z.string(),
  helpful: z.boolean().optional(),
  rating: z.number().min(1).max(5).optional(),
  accuracy: z.number().min(1).max(5).optional(),
  comments: z.string().optional(),
  issues: z.array(z.string()).optional(),
  // Outcome fields (for follow-up reporting)
  outcomeApplied: z.boolean().optional(),
  outcomeSuccess: z.boolean().optional(),
  outcomeNotes: z.string().optional(),
});

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

    // Verify user owns this recommendation
    const recommendation = await prisma.recommendation.findUnique({
      where: { id: validated.recommendationId },
      select: { userId: true },
    });

    if (!recommendation) {
      return NextResponse.json(
        { error: "Recommendation not found" },
        { status: 404 }
      );
    }

    if (recommendation.userId !== user.id) {
      return NextResponse.json(
        { error: "You can only provide feedback on your own recommendations" },
        { status: 403 }
      );
    }

    // Create or update feedback
    const feedback = await prisma.feedback.upsert({
      where: { recommendationId: validated.recommendationId },
      create: {
        recommendationId: validated.recommendationId,
        userId: user.id,
        helpful: validated.helpful,
        rating: validated.rating,
        accuracy: validated.accuracy,
        comments: validated.comments,
        issues: validated.issues,
        outcomeApplied: validated.outcomeApplied,
        outcomeSuccess: validated.outcomeSuccess,
        outcomeNotes: validated.outcomeNotes,
        outcomeReported: validated.outcomeSuccess != null,
      },
      update: {
        helpful: validated.helpful ?? undefined,
        rating: validated.rating ?? undefined,
        accuracy: validated.accuracy ?? undefined,
        comments: validated.comments ?? undefined,
        issues: validated.issues ?? undefined,
        outcomeApplied: validated.outcomeApplied ?? undefined,
        outcomeSuccess: validated.outcomeSuccess ?? undefined,
        outcomeNotes: validated.outcomeNotes ?? undefined,
        outcomeReported:
          validated.outcomeSuccess != null ? true : undefined,
      },
    });

    // Fire-and-forget: adjust source boosts based on this feedback
    processLearningSignal({
      recommendationId: validated.recommendationId,
      helpful: validated.helpful,
      rating: validated.rating,
      accuracy: validated.accuracy,
      outcomeSuccess: validated.outcomeSuccess,
    });

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
