import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DiagnosisDisplay } from "@/components/recommendations/diagnosis-display";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface RecommendationPageProps {
  params: {
    id: string;
  };
}

async function getRecommendation(id: string) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return null;
  }

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/recommendations/${id}`,
    {
      headers: {
        Cookie: `sb-access-token=${session.access_token}; sb-refresh-token=${session.refresh_token}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error("Failed to fetch recommendation");
  }

  return response.json();
}

export default async function RecommendationPage({
  params,
}: RecommendationPageProps) {
  const recommendation = await getRecommendation(params.id);

  if (!recommendation) {
    notFound();
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link
          href="/recommendations"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to recommendations
        </Link>
      </div>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Recommendation Details
          </h1>
          <p className="text-gray-600">
            Created on {new Date(recommendation.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        <Suspense fallback={<DiagnosisSkeleton />}>
          <DiagnosisDisplay
            diagnosis={recommendation.diagnosis}
            confidence={recommendation.confidence}
          />
        </Suspense>

        {recommendation.input && (
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Input Information</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-1">
                  Type
                </h3>
                <p className="text-gray-900 capitalize">
                  {recommendation.input.type}
                </p>
              </div>

              {recommendation.input.description && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-1">
                    Description
                  </h3>
                  <p className="text-gray-900">
                    {recommendation.input.description}
                  </p>
                </div>
              )}

              {recommendation.input.imageUrl && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Submitted Image
                  </h3>
                  <img
                    src={recommendation.input.imageUrl}
                    alt="Input image"
                    className="max-w-md rounded-lg border border-gray-200"
                  />
                </div>
              )}

              {recommendation.input.labData && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Lab Data
                  </h3>
                  <pre className="bg-gray-50 rounded-lg p-4 border border-gray-200 overflow-x-auto text-sm">
                    {JSON.stringify(recommendation.input.labData, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {recommendation.sources && recommendation.sources.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">
                Sources ({recommendation.sources.length})
              </h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recommendation.sources.map((source: any) => (
                  <div
                    key={source.id}
                    className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        {source.source && (
                          <h4 className="font-medium text-gray-900 mb-1">
                            {source.source.title}
                          </h4>
                        )}
                        <p className="text-sm text-gray-600">
                          Type: {source.type} • Relevance:{" "}
                          {Math.round(source.relevanceScore * 100)}%
                        </p>
                      </div>
                    </div>
                    {source.content && (
                      <p className="text-sm text-gray-700 line-clamp-3">
                        {source.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-sm text-gray-500 text-center py-4">
          Model: {recommendation.modelUsed || "Unknown"}
        </div>
      </div>
    </div>
  );
}

function DiagnosisSkeleton() {
  return (
    <Card className="border-2">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/3" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Skeleton className="h-4 w-1/4 mb-2" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div>
          <Skeleton className="h-4 w-1/3 mb-2" />
          <Skeleton className="h-32 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}
