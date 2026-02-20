"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Leaf,
  Plus,
  Camera,
  FileSpreadsheet,
} from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/utils/date";
import {
  getConfidenceColor,
  formatConfidence,
} from "@/lib/utils/format-diagnosis";
import { SecureImage } from "@/components/recommendations/secure-image";

interface Recommendation {
  id: string;
  createdAt: string;
  confidence: number;
  condition: string;
  conditionType: string;
  firstAction: string | null;
  input: {
    id: string;
    type: string;
    crop: string | null;
    location: string | null;
    imageUrl: string | null;
  };
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const typeIcons: Record<string, React.ReactNode> = {
  PHOTO: <Camera className="h-4 w-4" />,
  LAB_REPORT: <FileSpreadsheet className="h-4 w-4" />,
};

function RecommendationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState(
    searchParams.get("search") || ""
  );
  const [sortBy, setSortBy] = useState(
    searchParams.get("sort") || "date_desc"
  );
  const [page, setPage] = useState(
    parseInt(searchParams.get("page") || "1", 10)
  );

  const debouncedSearch = useDebounce(searchQuery, 300);

  const fetchRecommendations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("sort", sortBy);
      params.set("page", page.toString());
      params.set("pageSize", "20");

      const res = await fetch(`/api/v1/recommendations?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch recommendations");

      const data = await res.json();
      setRecommendations(data.recommendations);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, sortBy, page]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sortBy !== "date_desc") params.set("sort", sortBy);
    if (page > 1) params.set("page", page.toString());

    const newUrl = params.toString()
      ? `?${params.toString()}`
      : "/recommendations";
    router.replace(newUrl, { scroll: false });
  }, [debouncedSearch, sortBy, page, router]);

  if (error) {
    return (
      <div className="container max-w-6xl py-8">
        <h1 className="text-2xl font-bold mb-4">My Recommendations</h1>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Recommendations</h1>
        <Button asChild>
          <Link href="/diagnose">
            <Plus className="h-4 w-4 mr-2" />
            New Diagnosis
          </Link>
        </Button>
      </div>

      {/* Search and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by crop or condition..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>
        <Select
          value={sortBy}
          onValueChange={(value) => {
            setSortBy(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Newest first</SelectItem>
            <SelectItem value="date_asc">Oldest first</SelectItem>
            <SelectItem value="confidence_high">Highest confidence</SelectItem>
            <SelectItem value="confidence_low">Lowest confidence</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row gap-4">
                <Skeleton className="h-20 w-20 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && recommendations.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <Leaf className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">No recommendations yet</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? "No recommendations match your search. Try a different query."
                : "Start by uploading a photo or entering lab data to get your first recommendation."}
            </p>
            {!searchQuery && (
              <Button asChild>
                <Link href="/diagnose">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Recommendation
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recommendations Grid */}
      {!loading && recommendations.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {recommendations.map((rec) => (
              <Card
                key={rec.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden"
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: "160px",
                }}
                onClick={() => router.push(`/recommendations/${rec.id}`)}
              >
                <CardHeader className="flex flex-row gap-4 p-4">
                  {/* Image Thumbnail */}
                  <div className="relative h-20 w-20 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                    {rec.input.imageUrl ? (
                      <SecureImage
                        src={rec.input.imageUrl}
                        alt="Crop image"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-gray-400">
                        {typeIcons[rec.input.type] || <Leaf className="h-6 w-6" />}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {rec.condition}
                      </h3>
                      <Badge
                        variant="outline"
                        className={`${getConfidenceColor(rec.confidence)} shrink-0 text-xs`}
                      >
                        {formatConfidence(rec.confidence)}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      {rec.input.crop && (
                        <span className="capitalize">{rec.input.crop}</span>
                      )}
                      {rec.input.crop && rec.input.location && <span>•</span>}
                      {rec.input.location && <span>{rec.input.location}</span>}
                    </div>

                    <p className="text-xs text-gray-500">
                      {timeAgo(rec.createdAt)}
                    </p>

                    {rec.firstAction && (
                      <p className="text-sm text-gray-700 mt-2 line-clamp-1">
                        {rec.firstAction}
                      </p>
                    )}
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RecommendationsLoadingSkeleton() {
  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="flex flex-col sm:flex-row gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-48" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row gap-4">
              <Skeleton className="h-20 w-20 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function RecommendationsPage() {
  return (
    <Suspense fallback={<RecommendationsLoadingSkeleton />}>
      <RecommendationsContent />
    </Suspense>
  );
}
