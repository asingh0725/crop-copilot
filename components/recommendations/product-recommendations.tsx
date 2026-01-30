"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Beaker,
  Leaf,
  Bug,
  Sprout,
  FlaskConical,
  Package,
  RefreshCw,
  Loader2,
  ExternalLink,
  ShoppingCart,
  AlertTriangle,
} from "lucide-react";
import { ProductType } from "@prisma/client";

interface ProductRecommendation {
  id: string;
  productId: string;
  product: {
    id: string;
    name: string;
    brand: string | null;
    type: ProductType;
    analysis: Record<string, unknown> | null;
    applicationRate: string | null;
    crops: string[];
    description: string | null;
  };
  reason: string;
  applicationRate: string | null;
  priority: number;
  searchQuery: string | null;
  searchTimestamp: string;
}

interface ProductRecommendationsProps {
  recommendationId: string;
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

export function ProductRecommendations({ recommendationId }: ProductRecommendationsProps) {
  const [products, setProducts] = useState<ProductRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const method = refresh ? "POST" : "GET";
      const response = await fetch(
        `/api/recommendations/${recommendationId}/products`,
        { method }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to fetch products");
      }

      const data = await response.json();
      setProducts(data.products);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [recommendationId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Recommended Products
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Recommended Products
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchProducts(true)}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          Recommended Products
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchProducts(true)}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="text-center py-8">
            <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">
              No product recommendations found yet
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchProducts(true)}
              disabled={refreshing}
            >
              Search for Products
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {products.map((rec) => (
              <ProductRecommendationCard key={rec.id} recommendation={rec} />
            ))}

            {/* Legal Disclaimer */}
            <div className="mt-6 p-4 border border-amber-200 bg-amber-50 rounded-lg">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <strong>Important Notice:</strong> Product recommendations are provided for
                  informational purposes only. Before purchasing or applying any agricultural
                  product, please verify that it is registered and approved for use in your
                  region, on your specific crop, and complies with all applicable federal,
                  state, and local regulations. Always read and follow label instructions.
                  Consult with your local agricultural extension office or a licensed
                  agronomist for guidance specific to your situation.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductRecommendationCard({
  recommendation,
}: {
  recommendation: ProductRecommendation;
}) {
  const { product } = recommendation;
  const config = typeConfig[product.type] || typeConfig.OTHER;
  const Icon = config.icon;

  return (
    <div className="border rounded-lg p-4 hover:border-[#76C043] hover:shadow-sm transition-all">
      <div className="flex items-start gap-4">
        {/* Product icon */}
        <div className={`p-3 rounded-lg ${config.color.replace("text-", "bg-").split(" ")[0]}/20`}>
          <Icon className={`h-6 w-6 ${config.color.split(" ")[1]}`} />
        </div>

        {/* Product info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <h4 className="font-semibold text-gray-900">{product.name}</h4>
              {product.brand && (
                <p className="text-sm text-gray-500">{product.brand}</p>
              )}
            </div>
            <Badge variant="outline" className={`${config.color} shrink-0 text-xs`}>
              {config.label}
            </Badge>
          </div>

          {/* Analysis */}
          {product.analysis && (
            <p className="text-sm font-medium text-gray-700 mb-2">
              {formatAnalysis(product.analysis, product.type)}
            </p>
          )}

          {/* Reason */}
          <p className="text-sm text-gray-600 mb-3">{recommendation.reason}</p>

          {/* Application rate */}
          {recommendation.applicationRate && (
            <p className="text-xs text-gray-500 mb-3">
              <span className="font-medium">Application rate:</span>{" "}
              {recommendation.applicationRate}
            </p>
          )}

          {/* Crops */}
          {product.crops.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {product.crops.slice(0, 4).map((crop) => (
                <span
                  key={crop}
                  className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                >
                  {crop}
                </span>
              ))}
              {product.crops.length > 4 && (
                <span className="text-xs text-gray-400">
                  +{product.crops.length - 4} more
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/products/${product.id}`}>
                View Details
                <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
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

    return `Analysis: ${n}-${p}-${k}`;
  }

  if (analysis.activeIngredient) {
    return `Active: ${String(analysis.activeIngredient)}`;
  }

  return "";
}

function ProductCardSkeleton() {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-start gap-4">
        <Skeleton className="w-12 h-12 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-1">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}
