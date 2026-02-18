import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { productCacheService } from "@/lib/cache/product-cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/recommendations/[id]/products
 * Get precomputed product recommendations for a specific recommendation.
 */
export async function GET(
  _request: NextRequest,
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

    const products = await productCacheService.getProductRecommendations(recommendationId);

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

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: recommendationId } = await context.params;
  return NextResponse.json(
    {
      error:
        "Refreshing product recommendations from the recommendation view is disabled. Products are precomputed at recommendation generation time.",
      recommendationId,
    },
    { status: 405 }
  );
}
