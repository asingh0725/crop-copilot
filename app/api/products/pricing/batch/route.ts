import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { productCacheService, ProductPricing } from "@/lib/cache/product-cache";

export const dynamic = "force-dynamic";

interface BatchPricingResult {
  productId: string;
  productName: string;
  brand: string | null;
  pricing: ProductPricing[];
  error?: string;
}

/**
 * POST /api/products/pricing/batch
 * Get pricing for multiple products in one request
 * Useful for displaying pricing on product comparison pages
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { productIds, region: requestedRegion } = body;

    // Validate input
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: "Please provide an array of product IDs" },
        { status: 400 }
      );
    }

    if (productIds.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 products per batch request" },
        { status: 400 }
      );
    }

    // Get region from request or user profile
    let region = requestedRegion;
    if (!region) {
      const profile = await prisma.userProfile.findUnique({
        where: { userId: user.id },
        select: { location: true },
      });
      region = profile?.location || undefined;
    }

    // Get products from database
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
      },
    });

    // Create a map for quick lookup
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Fetch pricing for each product in parallel
    const results: BatchPricingResult[] = await Promise.all(
      productIds.map(async (productId: string): Promise<BatchPricingResult> => {
        const product = productMap.get(productId);

        if (!product) {
          return {
            productId,
            productName: "Unknown",
            brand: null,
            pricing: [],
            error: "Product not found",
          };
        }

        try {
          const pricing = await productCacheService.getProductPricing(
            productId,
            product.name,
            product.brand || undefined,
            region
          );

          return {
            productId,
            productName: product.name,
            brand: product.brand,
            pricing,
          };
        } catch (error) {
          console.error(`Error fetching pricing for ${productId}:`, error);
          return {
            productId,
            productName: product.name,
            brand: product.brand,
            pricing: [],
            error: "Failed to fetch pricing",
          };
        }
      })
    );

    // Calculate summary stats
    const successCount = results.filter((r) => !r.error).length;
    const totalPrices = results.reduce((sum, r) => sum + r.pricing.length, 0);

    return NextResponse.json({
      results,
      meta: {
        requested: productIds.length,
        successful: successCount,
        totalPrices,
        region: region || "United States",
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching batch pricing:", error);
    return NextResponse.json(
      { error: "Failed to fetch batch pricing" },
      { status: 500 }
    );
  }
}
