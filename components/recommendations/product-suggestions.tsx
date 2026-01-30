"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, ExternalLink, Scale, Search, ArrowRight } from "lucide-react";
import type { ProductSuggestion } from "@/lib/utils/format-diagnosis";

interface ProductSuggestionsProps {
  products: ProductSuggestion[];
}

export function ProductSuggestions({ products }: ProductSuggestionsProps) {
  if (!products || products.length === 0) {
    return null;
  }

  // Extract search term from product ID (e.g., "UAN 32-0-0" -> "UAN")
  const getSearchTerm = (productId: string) => {
    // Get first word or main product name
    return encodeURIComponent(productId.split(" ")[0]);
  };

  return (
    <Card className="print:shadow-none print:border-gray-300">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xl font-semibold flex items-center gap-2">
          <Package className="h-5 w-5 text-green-600" />
          Product Suggestions
        </CardTitle>
        <Button variant="outline" size="sm" asChild className="print:hidden">
          <Link href="/products">
            Browse All Products
            <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {products.map((product, index) => (
            <div
              key={index}
              className="border border-gray-200 rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {product.productId}
                  </h3>
                  {product.applicationRate && (
                    <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                      <Scale className="h-3.5 w-3.5" />
                      <span>{product.applicationRate}</span>
                    </div>
                  )}
                </div>
                <Badge variant="secondary" className="shrink-0">
                  Recommended
                </Badge>
              </div>

              <p className="text-sm text-gray-700 mb-3">{product.reason}</p>

              {product.alternatives && product.alternatives.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1">Alternatives:</p>
                  <div className="flex flex-wrap gap-1">
                    {product.alternatives.map((alt, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {alt}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 print:hidden">
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link href={`/products?search=${getSearchTerm(product.productId)}`}>
                    <Search className="h-3 w-3 mr-1" />
                    Find Product
                  </Link>
                </Button>
                {product.alternatives && product.alternatives.length > 0 && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/products?search=${getSearchTerm(product.alternatives[0])}`}>
                      Compare
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100 print:hidden">
          <p className="text-sm text-gray-600">
            <span className="font-medium">Tip:</span> Visit our{" "}
            <Link href="/products" className="text-green-600 hover:underline">
              Product Browser
            </Link>{" "}
            to compare prices from multiple retailers and find the best deals.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
