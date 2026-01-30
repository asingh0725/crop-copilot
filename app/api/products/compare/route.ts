import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productIds } = body;

    // Validate input
    if (!Array.isArray(productIds) || productIds.length < 2 || productIds.length > 6) {
      return NextResponse.json(
        { error: "Please provide between 2 and 6 product IDs to compare" },
        { status: 400 }
      );
    }

    // Fetch products
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
      },
    });

    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: "One or more products not found" },
        { status: 404 }
      );
    }

    // Transform products for comparison
    const transformedProducts = products.map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      type: product.type,
      analysis: product.analysis,
      applicationRate: product.applicationRate,
      crops: product.crops,
      description: product.description,
    }));

    // Find common crops across all products
    const allCropSets = transformedProducts.map((p) => new Set(p.crops));
    const firstProductCrops = transformedProducts[0]?.crops || [];
    const commonCrops = firstProductCrops.filter((crop) =>
      allCropSets.every((set) => set.has(crop))
    );

    // Calculate unique crops for each product
    const productsWithUniqueCrops = transformedProducts.map((product) => {
      const otherCrops = new Set(
        transformedProducts
          .filter((p) => p.id !== product.id)
          .flatMap((p) => p.crops)
      );
      const uniqueCrops = product.crops.filter((crop) => !otherCrops.has(crop));

      return {
        ...product,
        compatibility: {
          allCrops: product.crops,
          uniqueCrops,
          commonCrops,
        },
      };
    });

    // Calculate overall comparison stats
    const allTypes = Array.from(new Set(transformedProducts.map((p) => p.type)));

    const comparison = {
      types: allTypes,
      commonCrops,
      productCount: transformedProducts.length,
    };

    return NextResponse.json({
      products: productsWithUniqueCrops,
      comparison,
    });
  } catch (error) {
    console.error("Error comparing products:", error);
    return NextResponse.json(
      { error: "Failed to compare products" },
      { status: 500 }
    );
  }
}
