"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Search, X, Filter } from "lucide-react";
import { ProductType } from "@prisma/client";

interface ProductFiltersProps {
  onFiltersChange: (filters: FilterState) => void;
  initialFilters?: Partial<FilterState>;
}

export interface FilterState {
  search: string;
  types: ProductType[];
  crop: string;
  sortBy: string;
  sortOrder: string;
}

const productTypes: { value: ProductType; label: string }[] = [
  { value: "FERTILIZER", label: "Fertilizer" },
  { value: "AMENDMENT", label: "Amendment" },
  { value: "PESTICIDE", label: "Pesticide" },
  { value: "HERBICIDE", label: "Herbicide" },
  { value: "FUNGICIDE", label: "Fungicide" },
  { value: "INSECTICIDE", label: "Insecticide" },
  { value: "SEED_TREATMENT", label: "Seed Treatment" },
  { value: "BIOLOGICAL", label: "Biological" },
];

const crops = [
  "Corn",
  "Soybeans",
  "Wheat",
  "Cotton",
  "Alfalfa",
  "Rice",
  "Sorghum",
  "Vegetables",
  "Fruit Trees",
];

export function ProductFilters({ onFiltersChange, initialFilters }: ProductFiltersProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: initialFilters?.search || "",
    types: initialFilters?.types || [],
    crop: initialFilters?.crop || "",
    sortBy: initialFilters?.sortBy || "name",
    sortOrder: initialFilters?.sortOrder || "asc",
  });

  const [searchInput, setSearchInput] = useState(filters.search);

  const updateFilters = (updates: Partial<FilterState>) => {
    const newFilters = { ...filters, ...updates };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleSearch = () => {
    updateFilters({ search: searchInput });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const toggleType = (type: ProductType) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type];
    updateFilters({ types: newTypes });
  };

  const clearFilters = () => {
    const clearedFilters: FilterState = {
      search: "",
      types: [],
      crop: "",
      sortBy: "name",
      sortOrder: "asc",
    };
    setSearchInput("");
    setFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  const hasActiveFilters =
    filters.search ||
    filters.types.length > 0 ||
    filters.crop;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search products..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-10"
          />
        </div>
        <Button onClick={handleSearch} className="bg-[#2C5F2D] hover:bg-[#234a24]">
          Search
        </Button>
      </div>

      {/* Filters accordion for mobile */}
      <div className="lg:hidden">
        <Accordion type="single" collapsible>
          <AccordionItem value="filters">
            <AccordionTrigger className="py-2">
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
                {hasActiveFilters && (
                  <span className="bg-[#76C043] text-white text-xs px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <FilterContent
                filters={filters}
                toggleType={toggleType}
                updateFilters={updateFilters}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Filters for desktop */}
      <div className="hidden lg:block">
        <FilterContent
          filters={filters}
          toggleType={toggleType}
          updateFilters={updateFilters}
        />
      </div>

      {/* Sort and clear */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Sort by:</span>
          <Select
            value={filters.sortBy}
            onValueChange={(value) => updateFilters({ sortBy: value })}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="brand">Brand</SelectItem>
              <SelectItem value="type">Type</SelectItem>
              <SelectItem value="createdAt">Newest</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.sortOrder}
            onValueChange={(value) => updateFilters({ sortOrder: value })}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">A-Z</SelectItem>
              <SelectItem value="desc">Z-A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterContent({
  filters,
  toggleType,
  updateFilters,
}: {
  filters: FilterState;
  toggleType: (type: ProductType) => void;
  updateFilters: (updates: Partial<FilterState>) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Product type */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          Product Type
        </label>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {productTypes.map((type) => (
            <div key={type.value} className="flex items-center gap-2">
              <Checkbox
                id={type.value}
                checked={filters.types.includes(type.value)}
                onCheckedChange={() => toggleType(type.value)}
              />
              <label htmlFor={type.value} className="text-sm cursor-pointer">
                {type.label}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Crop filter */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          Compatible Crop
        </label>
        <Select
          value={filters.crop}
          onValueChange={(value) => updateFilters({ crop: value === "all" ? "" : value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All crops" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All crops</SelectItem>
            {crops.map((crop) => (
              <SelectItem key={crop} value={crop}>
                {crop}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
