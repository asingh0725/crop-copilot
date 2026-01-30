import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ProductType, Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const search = searchParams.get("search") || "";
    const typesParam = searchParams.get("types");
    const types = typesParam ? (typesParam.split(",") as ProductType[]) : [];
    const validTypes = types.filter((t) =>
      Object.values(ProductType).includes(t)
    );
    const crop = searchParams.get("crop") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const sortBy = searchParams.get("sortBy") || "name";
    const sortOrder = searchParams.get("sortOrder") || "asc";

    // Build where clause
    const where: Prisma.ProductWhereInput = {};

    // Search across name, brand, description
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // Filter by product type
    if (validTypes.length > 0) {
      where.type = { in: validTypes };
    }

    // Filter by crop compatibility
    if (crop) {
      where.crops = { has: crop };
    }

    // Build orderBy clause
    let orderBy: Prisma.ProductOrderByWithRelationInput = { name: "asc" };
    if (sortBy === "brand") {
      orderBy = { brand: sortOrder === "desc" ? "desc" : "asc" };
    } else if (sortBy === "name") {
      orderBy = { name: sortOrder === "desc" ? "desc" : "asc" };
    } else if (sortBy === "type") {
      orderBy = { type: sortOrder === "desc" ? "desc" : "asc" };
    } else if (sortBy === "createdAt") {
      orderBy = { createdAt: sortOrder === "desc" ? "desc" : "asc" };
    }

    // Get total count
    const total = await prisma.product.count({ where });

    // Fetch products (no prices table anymore - pricing is fetched via LLM)
    const products = await prisma.product.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
    });

    // Transform response
    const transformedProducts = products.map((product) => ({
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
    }));

    return NextResponse.json({
      products: transformedProducts,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
