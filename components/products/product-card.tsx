"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Beaker,
  Leaf,
  Bug,
  Sprout,
  FlaskConical,
  Package,
} from "lucide-react";
import { ProductType } from "@prisma/client";

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    brand: string | null;
    type: ProductType;
    analysis: Record<string, unknown> | null;
    crops: string[];
    description?: string | null;
  };
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
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

export function ProductCard({ product, selectable, selected, onSelect }: ProductCardProps) {
  const config = typeConfig[product.type] || typeConfig.OTHER;
  const Icon = config.icon;

  // Format analysis display
  const analysisDisplay = product.analysis
    ? formatAnalysis(product.analysis, product.type)
    : null;

  return (
    <Card className="group hover:shadow-lg transition-shadow">
      <CardContent className="p-4">
        {/* Header with checkbox */}
        <div className="flex items-start justify-between mb-3">
          <Badge variant="outline" className={`${config.color} text-xs`}>
            <Icon className="w-3 h-3 mr-1" />
            {config.label}
          </Badge>
          {selectable && (
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onSelect?.(product.id, !!checked)}
              aria-label={`Select ${product.name} for comparison`}
            />
          )}
        </div>

        {/* Product info */}
        <Link href={`/products/${product.id}`} className="block">
          <h3 className="font-semibold text-gray-900 group-hover:text-[#2C5F2D] transition-colors line-clamp-1">
            {product.name}
          </h3>
          {product.brand && (
            <p className="text-sm text-gray-500 mb-2">{product.brand}</p>
          )}

          {/* Analysis */}
          {analysisDisplay && (
            <p className="text-sm font-medium text-gray-700 mb-2">{analysisDisplay}</p>
          )}

          {/* Description */}
          {product.description && (
            <p className="text-xs text-gray-500 line-clamp-2 mb-2">{product.description}</p>
          )}

          {/* Crops */}
          <div className="flex flex-wrap gap-1 mb-3">
            {product.crops.slice(0, 3).map((crop) => (
              <span
                key={crop}
                className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
              >
                {crop}
              </span>
            ))}
            {product.crops.length > 3 && (
              <span className="text-xs text-gray-400">+{product.crops.length - 3}</span>
            )}
          </div>
        </Link>

        {/* View Details button */}
        <div className="flex items-center justify-end pt-3 border-t">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/products/${product.id}`}>
              View Details
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function formatAnalysis(analysis: Record<string, unknown>, type: ProductType): string | null {
  if (type === "FERTILIZER" || type === "AMENDMENT") {
    const n = analysis.N ?? analysis.n;
    const p = analysis.P ?? analysis.p;
    const k = analysis.K ?? analysis.k;
    const s = analysis.S ?? analysis.s;

    if (n !== undefined || p !== undefined || k !== undefined) {
      let result = `${n ?? 0}-${p ?? 0}-${k ?? 0}`;
      if (s !== undefined && s !== 0) {
        result += `-${s}S`;
      }
      return result;
    }
  }

  if (analysis.activeIngredient) {
    return String(analysis.activeIngredient);
  }

  return null;
}

// Skeleton loader
export function ProductCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="animate-pulse">
          <div className="h-5 w-20 bg-gray-200 rounded mb-3" />
          <div className="h-5 w-3/4 bg-gray-200 rounded mb-2" />
          <div className="h-4 w-1/2 bg-gray-200 rounded mb-2" />
          <div className="h-4 w-2/3 bg-gray-200 rounded mb-3" />
          <div className="flex gap-1 mb-3">
            <div className="h-5 w-12 bg-gray-200 rounded" />
            <div className="h-5 w-16 bg-gray-200 rounded" />
          </div>
          <div className="flex justify-end pt-3 border-t">
            <div className="h-8 w-24 bg-gray-200 rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
