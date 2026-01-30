import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const outcomeSchema = z.object({
  recommendationId: z.string(),
  outcomeApplied: z.boolean(),
  outcomeSuccess: z.boolean().nullable(),
  outcomeNotes: z.string().min(10, "Please provide some details about what happened"),
  outcomeImages: z.array(z.string()).optional(),
});

/**
 * POST /api/feedback/outcome
 * Submit outcome report for a recommendation (follow-up feedback)
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
    const validated = outcomeSchema.parse(body);

    // Get recommendation
    const recommendation = await prisma.recommendation.findUnique({
      where: { id: validated.recommendationId },
      include: {
        products: {
          include: { product: true },
        },
        input: true,
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
        { error: "You can only report outcomes on your own recommendations" },
        { status: 403 }
      );
    }

    // Check if feedback exists, create if not
    let feedback = await prisma.feedback.findUnique({
      where: { recommendationId: validated.recommendationId },
    });

    if (!feedback) {
      // Create initial feedback record with outcome
      feedback = await prisma.feedback.create({
        data: {
          recommendationId: validated.recommendationId,
          userId: user.id,
          outcomeReported: true,
          outcomeApplied: validated.outcomeApplied,
          outcomeSuccess: validated.outcomeSuccess,
          outcomeNotes: validated.outcomeNotes,
          outcomeImages: validated.outcomeImages || [],
          outcomeTimestamp: new Date(),
        },
      });
    } else {
      // Update existing feedback with outcome
      feedback = await prisma.feedback.update({
        where: { recommendationId: validated.recommendationId },
        data: {
          outcomeReported: true,
          outcomeApplied: validated.outcomeApplied,
          outcomeSuccess: validated.outcomeSuccess,
          outcomeNotes: validated.outcomeNotes,
          outcomeImages: validated.outcomeImages || [],
          outcomeTimestamp: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    // Update product feedback scores if applied and success reported
    if (validated.outcomeApplied && validated.outcomeSuccess !== null) {
      const diagnosis = extractDiagnosisType(recommendation.diagnosis);
      const crop = recommendation.input.crop || "unknown";

      for (const pr of recommendation.products) {
        await updateProductScore(
          pr.productId,
          diagnosis,
          crop,
          validated.outcomeSuccess
        );
      }
    }

    return NextResponse.json({ success: true, feedback });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }

    console.error("Error submitting outcome:", error);
    return NextResponse.json(
      { error: "Failed to submit outcome" },
      { status: 500 }
    );
  }
}

/**
 * Extract diagnosis type from recommendation diagnosis JSON
 */
function extractDiagnosisType(diagnosis: unknown): string {
  if (typeof diagnosis === "object" && diagnosis !== null) {
    const d = diagnosis as Record<string, unknown>;
    // Try various possible field names
    const condition =
      d.condition ||
      d.diagnosis ||
      d.problem ||
      d.issue ||
      d.title ||
      "unknown";
    return String(condition).toLowerCase().replace(/\s+/g, "_");
  }
  return "unknown";
}

/**
 * Update product feedback score based on outcome
 */
async function updateProductScore(
  productId: string,
  diagnosisType: string,
  cropType: string,
  success: boolean | null
) {
  const normalized = {
    diagnosisType: diagnosisType.toLowerCase().replace(/\s+/g, "_").slice(0, 100),
    cropType: cropType.toLowerCase().slice(0, 50),
  };

  try {
    await prisma.productFeedbackScore.upsert({
      where: {
        productId_diagnosisType_cropType: {
          productId,
          diagnosisType: normalized.diagnosisType,
          cropType: normalized.cropType,
        },
      },
      create: {
        productId,
        diagnosisType: normalized.diagnosisType,
        cropType: normalized.cropType,
        successCount: success === true ? 1 : 0,
        failureCount: success === false ? 1 : 0,
        partialCount: success === null ? 1 : 0,
        successRate: success === true ? 1.0 : success === false ? 0.0 : 0.5,
      },
      update: {
        successCount: success === true ? { increment: 1 } : undefined,
        failureCount: success === false ? { increment: 1 } : undefined,
        partialCount: success === null ? { increment: 1 } : undefined,
      },
    });

    // Recalculate success rate
    const scores = await prisma.productFeedbackScore.findUnique({
      where: {
        productId_diagnosisType_cropType: {
          productId,
          diagnosisType: normalized.diagnosisType,
          cropType: normalized.cropType,
        },
      },
    });

    if (scores) {
      const total =
        scores.successCount + scores.failureCount + scores.partialCount;
      const successRate =
        total > 0
          ? (scores.successCount + scores.partialCount * 0.5) / total
          : 0.5;

      await prisma.productFeedbackScore.update({
        where: {
          productId_diagnosisType_cropType: {
            productId,
            diagnosisType: normalized.diagnosisType,
            cropType: normalized.cropType,
          },
        },
        data: { successRate },
      });
    }
  } catch (error) {
    console.error(
      `Error updating product score for ${productId}:`,
      error
    );
  }
}
