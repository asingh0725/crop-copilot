import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { productCacheService } from "@/lib/cache/product-cache";

export const dynamic = "force-dynamic";

/**
 * POST /api/products/[id]/pricing
 * Fetch pricing for a product on-demand
 * Accepts region parameter for localized pricing (max 5 results)
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

    const { id: productId } = await context.params;

    // Parse request body for region
    let region: string | undefined;
    try {
      const body = await request.json();
      region = body.region;
    } catch {
      // No body or invalid JSON - use default region
    }

    // If no region provided, try to get from user profile
    if (!region) {
      const profile = await prisma.userProfile.findUnique({
        where: { userId: user.id },
        select: { location: true },
      });
      region = profile?.location || undefined;
    }

    // Get product from database
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Get pricing with caching (uses Gemini with Google Search)
    const pricing = await productCacheService.getProductPricing(
      productId,
      product.name,
      product.brand || undefined,
      region
    );

    return NextResponse.json({
      productId,
      productName: product.name,
      brand: product.brand,
      pricing,
      meta: {
        count: pricing.length,
        region: region || "United States",
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching product pricing:", error);
    return NextResponse.json(
      { error: "Failed to fetch product pricing" },
      { status: 500 }
    );
  }
}
