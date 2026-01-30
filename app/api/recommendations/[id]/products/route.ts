import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { productCacheService } from "@/lib/cache/product-cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/recommendations/[id]/products
 * Get product recommendations for a specific recommendation
 * Uses multi-tier caching: Redis → Database → LLM
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: recommendationId } = await context.params;

    // Get the recommendation with input context
    const recommendation = await prisma.recommendation.findUnique({
      where: { id: recommendationId },
      include: {
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Extract diagnosis text from recommendation
    const diagnosis = recommendation.diagnosis as {
      summary?: string;
      problem?: string;
      issue?: string;
    };
    const diagnosisText =
      diagnosis?.summary || diagnosis?.problem || diagnosis?.issue || "General agricultural issue";

    // Get product recommendations with caching
    const products = await productCacheService.getProductRecommendations(
      recommendationId,
      diagnosisText,
      recommendation.input?.crop || undefined,
      recommendation.input?.location || undefined
    );

    return NextResponse.json({
      products,
      meta: {
        recommendationId,
        count: products.length,
        cached: products.length > 0,
      },
    });
  } catch (error) {
    console.error("Error fetching product recommendations:", error);
    return NextResponse.json(
      { error: "Failed to fetch product recommendations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/recommendations/[id]/products
 * Refresh product recommendations (force new LLM search)
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: recommendationId } = await context.params;

    // Get the recommendation with input context
    const recommendation = await prisma.recommendation.findUnique({
      where: { id: recommendationId },
      include: {
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Extract diagnosis text from recommendation
    const diagnosis = recommendation.diagnosis as {
      summary?: string;
      problem?: string;
      issue?: string;
    };
    const diagnosisText =
      diagnosis?.summary || diagnosis?.problem || diagnosis?.issue || "General agricultural issue";

    // Force refresh product recommendations
    const products = await productCacheService.refreshProductRecommendations(
      recommendationId,
      diagnosisText,
      recommendation.input?.crop || undefined,
      recommendation.input?.location || undefined
    );

    return NextResponse.json({
      products,
      meta: {
        recommendationId,
        count: products.length,
        refreshed: true,
      },
    });
  } catch (error) {
    console.error("Error refreshing product recommendations:", error);
    return NextResponse.json(
      { error: "Failed to refresh product recommendations" },
      { status: 500 }
    );
  }
}
