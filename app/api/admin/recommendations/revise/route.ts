import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateAdminAuth } from "@/lib/admin/auth";
import {
  searchTextChunks,
  searchImageChunks,
  fetchRequiredTextChunks,
} from "@/lib/retrieval/search";
import { assembleContext } from "@/lib/retrieval/context-assembly";
import { buildRetrievalPlan } from "@/lib/retrieval/query";
import { resolveSourceHints } from "@/lib/retrieval/source-hints";
import { generateWithRetry } from "@/lib/validation/retry";
import { CLAUDE_MODEL } from "@/lib/ai/claude";

const reviseSchema = z.object({
  recommendationId: z.string().min(1),
  requiredSourceIds: z.array(z.string()).min(1),
});

export async function POST(request: NextRequest) {
  const authError = validateAdminAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const validated = reviseSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { recommendationId, requiredSourceIds } = validated.data;

    // Load original recommendation and input
    const original = await prisma.recommendation.findUnique({
      where: { id: recommendationId },
      include: { input: true },
    });

    if (!original || !original.input) {
      return NextResponse.json(
        { error: "Recommendation or input not found" },
        { status: 404 }
      );
    }

    const input = original.input;

    // Re-run retrieval with forced sources
    const plan = buildRetrievalPlan({
      description: input.description,
      labData: input.labData as Record<string, unknown> | null,
      crop: input.crop,
      location: input.location,
      growthStage: input.season,
      type: input.type,
    });

    const sourceHints = await resolveSourceHints(plan.sourceTitleHints);

    // Merge forced sources with existing required sources
    const allRequiredSourceIds = Array.from(
      new Set([
        ...sourceHints.requiredSourceIds,
        ...requiredSourceIds,
      ])
    );

    const searchOptions = {
      crop: input.crop ?? (input.labData as any)?.crop ?? undefined,
      region: input.location ?? undefined,
      topics: plan.topics,
      sourceBoosts: {
        ...sourceHints.sourceBoosts,
        // Boost forced sources heavily
        ...Object.fromEntries(
          requiredSourceIds.map((id) => [id, 0.2])
        ),
      },
    };

    const textResults = await searchTextChunks(plan.query, 5, searchOptions);
    const requiredText = await fetchRequiredTextChunks(
      plan.query,
      allRequiredSourceIds
    );
    const imageResults = await searchImageChunks(plan.query, 3, searchOptions);
    const context = await assembleContext(
      [...textResults, ...requiredText],
      imageResults,
      { requiredSourceIds: allRequiredSourceIds }
    );

    if (context.totalChunks === 0) {
      return NextResponse.json(
        { error: "No relevant knowledge found for revision" },
        { status: 422 }
      );
    }

    // Re-generate recommendation
    const normalizedInput = {
      type: input.type,
      description: input.description || undefined,
      labData: input.labData || undefined,
      imageUrl: input.imageUrl || undefined,
      crop: input.crop ?? (input.labData as any)?.crop ?? undefined,
      location: input.location || undefined,
    };

    const newRecommendation = await generateWithRetry(
      normalizedInput,
      context
    );

    // Count existing revisions
    const existingRevisions = await prisma.recommendationRevision.count({
      where: { recommendationId },
    });

    // Store revision
    const revision = await prisma.recommendationRevision.create({
      data: {
        recommendationId,
        revisionIndex: existingRevisions + 1,
        promptVersion: CLAUDE_MODEL,
        diagnosis: newRecommendation as object,
        confidence: newRecommendation.confidence,
        forcedSourceIds: requiredSourceIds,
      },
    });

    // Compare with original
    const originalDiag = original.diagnosis as any;
    const comparison = {
      confidenceDelta:
        newRecommendation.confidence - (originalDiag?.confidence || 0),
      originalCondition: originalDiag?.diagnosis?.condition || "unknown",
      revisedCondition: newRecommendation.diagnosis.condition,
      sourcesUsed: newRecommendation.sources.length,
      forcedSourcesCited: newRecommendation.sources.filter((s) =>
        requiredSourceIds.some((reqId) => {
          // Check if any of the forced source's chunks were cited
          return s.chunkId.includes(reqId);
        })
      ).length,
    };

    return NextResponse.json({
      revision,
      comparison,
    });
  } catch (error) {
    console.error("Revise recommendation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
