"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import {
  ProductCard,
  ProductCardSkeleton,
} from "@/components/products/product-card";
import {
  ProductFilters,
  FilterState,
} from "@/components/products/product-filters";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Package, Scale, ChevronLeft, ChevronRight } from "lucide-react";
import { ProductType } from "@prisma/client";

interface Product {
  id: string;
  name: string;
  brand: string | null;
  type: ProductType;
  analysis: Record<string, unknown> | null;
  crops: string[];
  description: string | null;
}

interface ProductsResponse {
  products: Product[];
  total: number;
  limit: number;
  offset: number;
}

const ITEMS_PER_PAGE = 12;

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set()
  );
  const [filters, setFilters] = useState<FilterState>({
    search: searchParams.get("search") || "",
    types: [],
    crop: searchParams.get("crop") || "",
    sortBy: searchParams.get("sortBy") || "name",
    sortOrder: searchParams.get("sortOrder") || "asc",
  });

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.types.length > 0) {
        params.set("types", filters.types.join(","));
      }
      if (filters.crop) params.set("crop", filters.crop);
      params.set("sortBy", filters.sortBy);
      params.set("sortOrder", filters.sortOrder);
      params.set("limit", ITEMS_PER_PAGE.toString());
      params.set("offset", ((page - 1) * ITEMS_PER_PAGE).toString());

      const response = await fetch(`/api/v1/products?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch products");

      const data: ProductsResponse = await response.json();

      setProducts(data.products);
      setTotal(data.total);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleFiltersChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page on filter change
  };

  const handleSelectProduct = (id: string, selected: boolean) => {
    setSelectedProducts((prev) => {
      const newSet = new Set(prev);
      if (selected && newSet.size < 6) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  const handleCompare = () => {
    const ids = Array.from(selectedProducts).join(",");
    router.push(`/products/compare?ids=${ids}`);
  };

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Product Browser"
        description="Browse fertilizers, pesticides, and agricultural products. Click on any product to view details and live pricing."
      />

      {/* Filters */}
      <div className="mb-6 rounded-lg border bg-white p-4">
        <ProductFilters
          onFiltersChange={handleFiltersChange}
          initialFilters={filters}
        />
      </div>

      {/* Compare bar */}
      {selectedProducts.size > 0 && (
        <div className="mb-6 flex items-center justify-between rounded-lg bg-[#2C5F2D] p-4 text-white">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            <span>
              {selectedProducts.size} product
              {selectedProducts.size > 1 ? "s" : ""} selected
            </span>
            <span className="text-sm text-white/60">(max 6)</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedProducts(new Set())}
              className="border-white/30 bg-transparent text-white hover:bg-white/10"
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleCompare}
              disabled={selectedProducts.size < 2}
              className="bg-white text-[#2C5F2D] hover:bg-white/90"
            >
              Compare
            </Button>
          </div>
        </div>
      )}

      {/* Results count */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {loading ? "Loading..." : `${total} products found`}
        </p>
        {selectedProducts.size === 0 && (
          <p className="text-sm text-gray-400">Select products to compare</p>
        )}
      </div>

      {/* Product grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products found"
          description="Try adjusting your search or filters to find what you're looking for."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              selectable
              selected={selectedProducts.has(product.id)}
              onSelect={handleSelectProduct}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="px-4 text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
