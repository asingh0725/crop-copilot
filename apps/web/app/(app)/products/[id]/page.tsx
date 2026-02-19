"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Package,
  Scale,
  Beaker,
  Leaf,
  Bug,
  Sprout,
  FlaskConical,
  Loader2,
  DollarSign,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { ProductType } from "@prisma/client";

interface RelatedProduct {
  id: string;
  name: string;
  brand: string | null;
  type: ProductType;
  analysis: Record<string, unknown> | null;
  crops: string[];
}

interface ProductDetail {
  id: string;
  name: string;
  brand: string | null;
  type: ProductType;
  analysis: Record<string, unknown> | null;
  applicationRate: string | null;
  crops: string[];
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  relatedProducts: RelatedProduct[];
  usedInRecommendations: number;
}

interface ProductPricing {
  price: number | null;
  unit: string;
  retailer: string;
  url: string | null;
  region: string;
  lastUpdated: string;
}

interface BatchPricingEntry {
  productId: string;
  productName: string;
  brand: string | null;
  pricing: {
    currency: string;
    retailPrice: number | null;
    wholesalePrice: number | null;
    unit: string | null;
    availability: string | null;
    lastUpdated: string | null;
  };
}

interface BatchPricingResponse {
  pricing: BatchPricingEntry[];
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

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [pricing, setPricing] = useState<ProductPricing[]>([]);
  const [pricingRegion, setPricingRegion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingFetched, setPricingFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProduct() {
      try {
        const response = await fetch(`/api/v1/products/${params.id}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("Product not found");
          } else {
            throw new Error("Failed to fetch product");
          }
          return;
        }
        const data = await response.json();
        setProduct(data);
      } catch (err) {
        setError("Failed to load product details");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (params.id) {
      fetchProduct();
    }
  }, [params.id]);

  // Fetch pricing on-demand only (POST)
  const fetchPricing = async () => {
    if (!params.id) return;

    setPricingLoading(true);
    setPricingFetched(true);
    try {
      const response = await fetch(`/api/v1/products/pricing/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [params.id] }),
      });

      if (response.ok) {
        const data: BatchPricingResponse = await response.json();
        const entry = data.pricing.find((item) => item.productId === params.id) ?? data.pricing[0];

        if (!entry) {
          setPricing([]);
          setPricingRegion(null);
          return;
        }

        const unit = entry.pricing.unit ?? "unit";
        const fallbackTimestamp = new Date().toISOString();
        const normalizedPricing: ProductPricing[] = [
          {
            price: entry.pricing.retailPrice,
            unit,
            retailer: "Retail",
            url: null,
            region: "United States",
            lastUpdated: entry.pricing.lastUpdated ?? fallbackTimestamp,
          },
          {
            price: entry.pricing.wholesalePrice,
            unit,
            retailer: "Wholesale",
            url: null,
            region: "United States",
            lastUpdated: entry.pricing.lastUpdated ?? fallbackTimestamp,
          },
        ];

        setPricing(normalizedPricing);
        setPricingRegion("United States");
      }
    } catch (err) {
      console.error("Failed to fetch pricing:", err);
    } finally {
      setPricingLoading(false);
    }
  };

  if (loading) {
    return <ProductDetailSkeleton />;
  }

  if (error || !product) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {error || "Product not found"}
          </h2>
          <Button variant="outline" onClick={() => router.push("/products")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Products
          </Button>
        </div>
      </div>
    );
  }

  const config = typeConfig[product.type] || typeConfig.OTHER;
  const Icon = config.icon;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
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

      {/* Product header */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Product image placeholder */}
          <div className="w-full lg:w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
            <Icon className="h-16 w-16 text-gray-400" />
          </div>

          {/* Product info */}
          <div className="flex-1">
            <div className="flex flex-wrap items-start gap-2 mb-2">
              <Badge variant="outline" className={config.color}>
                <Icon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
              {product.name}
            </h1>
            {product.brand && (
              <p className="text-lg text-gray-600 mb-4">{product.brand}</p>
            )}

            {/* Analysis */}
            {product.analysis && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  {product.type === "FERTILIZER" || product.type === "AMENDMENT"
                    ? "Analysis"
                    : "Active Ingredient"}
                </h3>
                <p className="text-xl font-semibold text-gray-900">
                  {formatAnalysis(product.analysis, product.type)}
                </p>
              </div>
            )}

            {/* Application rate */}
            {product.applicationRate && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Application Rate
                </h3>
                <p className="text-gray-900">{product.applicationRate}</p>
              </div>
            )}

            {/* Crops */}
            {product.crops.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  Compatible Crops
                </h3>
                <div className="flex flex-wrap gap-2">
                  {product.crops.map((crop) => (
                    <Badge key={crop} variant="outline">
                      {crop}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {product.description && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 leading-relaxed">{product.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Pricing section - on-demand only */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Pricing & Availability
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!pricingFetched ? (
            // Initial state - show "Show Pricing" button
            <div className="text-center py-8">
              <DollarSign className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">
                Search for current prices from retailers in your area
              </p>
              <p className="text-xs text-gray-400 mb-4">
                Pricing data is fetched from online retailers and may vary by location
              </p>
              <Button
                onClick={fetchPricing}
                disabled={pricingLoading}
                className="bg-[#76C043] hover:bg-[#5a9c2e]"
              >
                {pricingLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <DollarSign className="h-4 w-4 mr-2" />
                )}
                Show Pricing
              </Button>
            </div>
          ) : pricingLoading ? (
            // Loading state
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 mr-2" />
              <span className="text-gray-500">Searching for current prices...</span>
            </div>
          ) : pricing.length > 0 ? (
            // Results state
            <>
              {pricingRegion && (
                <div className="flex items-center gap-1 text-sm text-gray-500 mb-4">
                  <MapPin className="h-4 w-4" />
                  <span>Showing prices for: {pricingRegion}</span>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Retailer</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pricing.map((price, index) => (
                    <TableRow key={`${price.retailer}-${index}`}>
                      <TableCell className="font-medium">
                        {price.retailer}
                        {index === 0 && price.price !== null && (
                          <Badge className="ml-2 bg-green-100 text-green-700">
                            Best Price
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {price.price !== null ? (
                          <>
                            <span className="font-semibold">
                              ${price.price.toFixed(2)}
                            </span>
                            <span className="text-gray-500 ml-1">{price.unit}</span>
                          </>
                        ) : (
                          <span className="text-gray-400">Price unavailable</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {price.url && (
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <a
                              href={price.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Buy
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-gray-400 mt-4">
                Prices shown are estimates from online retailers and may not reflect current availability or final costs including shipping and taxes.
              </p>
            </>
          ) : (
            // No results state
            <div className="text-center py-8">
              <p className="text-gray-500 mb-2">
                No pricing information found for this product
              </p>
              <p className="text-xs text-gray-400">
                Try searching for this product directly on agricultural retailer websites
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Related products */}
      {product.relatedProducts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Related Products</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/products/compare?ids=${product.id},${product.relatedProducts
                  .slice(0, 2)
                  .map((p) => p.id)
                  .join(",")}`}
              >
                <Scale className="h-4 w-4 mr-1" />
                Compare
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {product.relatedProducts.map((related) => (
                <Link
                  key={related.id}
                  href={`/products/${related.id}`}
                  className="block p-4 border rounded-lg hover:border-[#76C043] hover:shadow-sm transition-all"
                >
                  <h4 className="font-medium text-gray-900 line-clamp-1">
                    {related.name}
                  </h4>
                  {related.brand && (
                    <p className="text-sm text-gray-500">{related.brand}</p>
                  )}
                  {related.analysis && (
                    <p className="mt-2 text-sm font-medium text-gray-700">
                      {formatAnalysis(related.analysis, related.type)}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
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
    const s = analysis.S ?? analysis.s;

    let result = `${n}-${p}-${k}`;
    if (s !== undefined && s !== 0) {
      result += ` + ${s}% S`;
    }
    return result;
  }

  if (analysis.activeIngredient) {
    return String(analysis.activeIngredient);
  }

  return JSON.stringify(analysis);
}

function ProductDetailSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <Skeleton className="h-9 w-32 mb-4" />
      <div className="bg-white rounded-lg border p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <Skeleton className="w-full lg:w-48 h-48 rounded-lg" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
