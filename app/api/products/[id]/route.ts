import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // Fetch product with all details
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        recommendations: {
          select: {
            id: true,
            recommendationId: true,
            reason: true,
            priority: true,
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Get count of recommendations using this product
    const usedInRecommendations = product.recommendations.length;

    // Find related products (same type, different product)
    const relatedProducts = await prisma.product.findMany({
      where: {
        type: product.type,
        id: { not: product.id },
      },
      take: 4,
    });

    // Transform response
    const response = {
      id: product.id,
      name: product.name,
      brand: product.brand,
      type: product.type,
      analysis: product.analysis,
      applicationRate: product.applicationRate,
      crops: product.crops,
      description: product.description,
      metadata: product.metadata,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      relatedProducts: relatedProducts.map((rp) => ({
        id: rp.id,
        name: rp.name,
        brand: rp.brand,
        type: rp.type,
        analysis: rp.analysis,
        crops: rp.crops,
      })),
      usedInRecommendations,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json(
      { error: "Failed to fetch product" },
      { status: 500 }
    );
  }
}
