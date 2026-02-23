"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getBrowserApiBase } from "@/lib/api-client";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  X,
  Plus,
  Beaker,
  Leaf,
  Bug,
  Sprout,
  FlaskConical,
  Package,
} from "lucide-react";
import type { ProductType } from "@/lib/types/product";

interface CompareProduct {
  id: string;
  name: string;
  brand: string | null;
  type: ProductType;
  analysis: Record<string, unknown> | null;
  applicationRate: string | null;
  crops: string[];
  description: string | null;
  compatibility: {
    allCrops: string[];
    uniqueCrops: string[];
    commonCrops: string[];
  };
}

interface CompareResponse {
  products: CompareProduct[];
  comparison: {
    types: ProductType[];
    commonCrops: string[];
    productCount: number;
  };
}

const typeConfig: Record<ProductType, { icon: typeof Beaker; color: string; label: string }> = {
  FERTILIZER: { icon: Beaker, color: "bg-green-100 text-green-700", label: "Fertilizer" },
  AMENDMENT: { icon: Leaf, color: "bg-amber-100 text-amber-700", label: "Amendment" },
  PESTICIDE: { icon: Bug, color: "bg-red-100 text-red-700", label: "Pesticide" },
  HERBICIDE: { icon: Sprout, color: "bg-purple-100 text-purple-700", label: "Herbicide" },
  FUNGICIDE: { icon: FlaskConical, color: "bg-blue-100 text-blue-700", label: "Fungicide" },
  INSECTICIDE: { icon: Bug, color: "bg-orange-100 text-orange-700", label: "Insecticide" },
  SEED_TREATMENT: { icon: Sprout, color: "bg-teal-100 text-teal-700", label: "Seed Treatment" },
  BIOLOGICAL: { icon: Leaf, color: "bg-emerald-100 text-emerald-700", label: "Biological" },
  OTHER: { icon: Package, color: "bg-gray-100 text-gray-700", label: "Other" },
};

export default function ProductComparePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const productIds = searchParams.get("ids")?.split(",").filter(Boolean) || [];

  useEffect(() => {
    async function fetchComparison() {
      if (productIds.length < 2) {
        setError("Please select at least 2 products to compare");
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const base = getBrowserApiBase();
        const response = await fetch(`${base}/api/v1/products/compare`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ productIds }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Failed to compare products");
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load comparison");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchComparison();
  }, [searchParams]);

  const removeProduct = (id: string) => {
    const newIds = productIds.filter((pid) => pid !== id);
    if (newIds.length < 2) {
      router.push("/products");
    } else {
      router.push(`/products/compare?ids=${newIds.join(",")}`);
    }
  };

  if (loading) {
    return <ComparePageSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {error || "Unable to compare products"}
          </h2>
          <p className="text-gray-500 mb-4">
            Select at least 2 products from the product browser to compare.
          </p>
          <Button variant="outline" onClick={() => router.push("/products")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Browse Products
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/products")}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Products
      </Button>

      <PageHeader
        title={`Comparing ${data.products.length} Products`}
        description="Side-by-side comparison of selected agricultural products."
      />

      {/* Comparison summary */}
      {data.comparison.commonCrops.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                Common crops:
              </span>
              {data.comparison.commonCrops.map((crop) => (
                <Badge key={crop} variant="secondary">
                  {crop}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparison table - horizontal scroll on mobile */}
      <div className="overflow-x-auto pb-4">
        <div className="inline-flex gap-4 min-w-full">
          {data.products.map((product) => {
            const config = typeConfig[product.type] || typeConfig.OTHER;
            const Icon = config.icon;

            return (
              <Card key={product.id} className="w-72 shrink-0">
                <CardContent className="p-4">
                  {/* Header with remove button */}
                  <div className="flex items-start justify-between mb-3">
                    <Badge variant="outline" className={config.color}>
                      <Icon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => removeProduct(product.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Product name & brand */}
                  <Link
                    href={`/products/${product.id}`}
                    className="block hover:text-[#2C5F2D]"
                  >
                    <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1">
                      {product.name}
                    </h3>
                  </Link>
                  {product.brand && (
                    <p className="text-sm text-gray-500 mb-4">{product.brand}</p>
                  )}

                  {/* Analysis */}
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-gray-500 mb-1">
                      Analysis
                    </h4>
                    <p className="font-medium">
                      {product.analysis
                        ? formatAnalysis(product.analysis, product.type)
                        : "N/A"}
                    </p>
                  </div>

                  {/* Application rate */}
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-gray-500 mb-1">
                      Application Rate
                    </h4>
                    <p className="text-sm">{product.applicationRate || "N/A"}</p>
                  </div>

                  {/* Crops */}
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-gray-500 mb-1">
                      Crops
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {product.crops.slice(0, 4).map((crop) => (
                        <span
                          key={crop}
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            product.compatibility.uniqueCrops.includes(crop)
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {crop}
                        </span>
                      ))}
                      {product.crops.length > 4 && (
                        <span className="text-xs text-gray-400">
                          +{product.crops.length - 4}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {product.description && (
                    <div className="mb-4">
                      <h4 className="text-xs font-medium text-gray-500 mb-1">
                        Description
                      </h4>
                      <p className="text-xs text-gray-600 line-clamp-3">
                        {product.description}
                      </p>
                    </div>
                  )}

                  {/* View details button */}
                  <div className="border-t pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      asChild
                    >
                      <Link href={`/products/${product.id}`}>
                        View Details & Pricing
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Add more products card */}
          {data.products.length < 6 && (
            <Card className="w-72 shrink-0 border-dashed">
              <CardContent className="p-4 h-full flex flex-col items-center justify-center text-center">
                <Plus className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500 mb-4">
                  Add more products to compare (up to 6)
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/products">Browse Products</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function formatAnalysis(
  analysis: Record<string, unknown>,
  type: ProductType
): string {
  if (type === "FERTILIZER" || type === "AMENDMENT") {
    const n = analysis.N ?? analysis.n ?? 0;
    const p = analysis.P ?? analysis.p ?? 0;
    const k = analysis.K ?? analysis.k ?? 0;

    return `${n}-${p}-${k}`;
  }

  if (analysis.activeIngredient) {
    const ingredient = String(analysis.activeIngredient);
    return ingredient.length > 30 ? ingredient.slice(0, 30) + "..." : ingredient;
  }

  return "N/A";
}

function ComparePageSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <Skeleton className="h-9 w-32 mb-4" />
      <Skeleton className="h-10 w-64 mb-2" />
      <Skeleton className="h-5 w-96 mb-6" />
      <div className="flex gap-4 overflow-x-auto">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="w-72 h-96 shrink-0 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
