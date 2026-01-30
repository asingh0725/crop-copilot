import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { DiagnosisDisplay } from "@/components/recommendations/diagnosis-display";
import { RecommendationContent } from "@/components/recommendations/recommendation-content";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { FullRecommendation } from "@/lib/utils/format-diagnosis";

interface RecommendationPageProps {
  params: {
    id: string;
  };
}

async function getRecommendation(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // First try to find by recommendation ID
  let recommendation = await prisma.recommendation.findUnique({
    where: { id },
    include: {
      input: {
        include: {
          user: {
            include: {
              profile: true,
            },
          },
        },
      },
      sources: {
        include: {
          textChunk: {
            include: {
              source: true,
            },
          },
          imageChunk: {
            include: {
              source: true,
            },
          },
        },
      },
    },
  });

  // If not found, try to find by input ID
  if (!recommendation) {
    recommendation = await prisma.recommendation.findUnique({
      where: { inputId: id },
      include: {
        input: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
        sources: {
          include: {
            textChunk: {
              include: {
                source: true,
              },
            },
            imageChunk: {
              include: {
                source: true,
              },
            },
          },
        },
      },
    });
  }

  if (!recommendation) {
    return null;
  }

  // Check if user owns this recommendation
  if (recommendation.input.userId !== user.id) {
    return null;
  }

  // Format response with all necessary data
  return {
    id: recommendation.id,
    createdAt: recommendation.createdAt,
    diagnosis: recommendation.diagnosis,
    confidence: recommendation.confidence,
    modelUsed: recommendation.modelUsed,
    input: {
      id: recommendation.input.id,
      type: recommendation.input.type,
      description: recommendation.input.description,
      imageUrl: recommendation.input.imageUrl,
      labData: recommendation.input.labData,
      crop: recommendation.input.crop,
      location: recommendation.input.location,
      season: recommendation.input.season,
      createdAt: recommendation.input.createdAt,
    },
    sources: recommendation.sources.map((source) => {
      const chunk = source.textChunk || source.imageChunk;
      const sourceDoc = chunk?.source;

      return {
        id: source.id,
        chunkId: source.textChunkId || source.imageChunkId,
        type: source.textChunkId ? "text" : "image",
        content: source.textChunk?.content || source.imageChunk?.caption,
        imageUrl: source.imageChunk?.imageUrl,
        relevanceScore: source.relevanceScore,
        source: sourceDoc
          ? {
              id: sourceDoc.id,
              title: sourceDoc.title,
              type: sourceDoc.sourceType,
              url: sourceDoc.url,
              publisher: sourceDoc.institution,
              publishedDate: (sourceDoc.metadata as Record<string, unknown>)?.publishedDate
                ? new Date((sourceDoc.metadata as Record<string, unknown>).publishedDate as string).toLocaleDateString()
                : null,
            }
          : null,
      };
    }),
  };
}

export default async function RecommendationPage({
  params,
}: RecommendationPageProps) {
  const recommendation = await getRecommendation(params.id);

  if (!recommendation) {
    notFound();
  }

  // Parse the diagnosis field which contains the full recommendation
  const fullRecommendation = recommendation.diagnosis as unknown as FullRecommendation;
  const diagnosis = fullRecommendation.diagnosis || recommendation.diagnosis;
  const actionItems = fullRecommendation.recommendations || [];
  const products = fullRecommendation.products || [];

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 print:max-w-none print:px-0">
      <div className="mb-6 print:hidden">
        <Link
          href="/recommendations"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Recommendations
        </Link>
      </div>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Recommendation Details
          </h1>
          <p className="text-gray-600">
            Created on{" "}
            {new Date(recommendation.createdAt).toLocaleDateString("en-US", {
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
            diagnosis={diagnosis}
            confidence={recommendation.confidence}
          />
        </Suspense>

        <RecommendationContent
          actionItems={actionItems}
          sources={recommendation.sources}
          products={products}
          recommendationId={recommendation.id}
        />

        {recommendation.input && (
          <Card className="print:shadow-none print:border-gray-300">
            <CardHeader>
              <h2 className="text-xl font-semibold">Input Information</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-1">
                    Type
                  </h3>
                  <p className="text-gray-900 capitalize">
                    {recommendation.input.type}
                  </p>
                </div>
                {recommendation.input.crop && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-1">
                      Crop
                    </h3>
                    <p className="text-gray-900 capitalize">
                      {recommendation.input.crop}
                    </p>
                  </div>
                )}
                {recommendation.input.location && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-1">
                      Location
                    </h3>
                    <p className="text-gray-900">
                      {recommendation.input.location}
                    </p>
                  </div>
                )}
                {recommendation.input.season && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-1">
                      Season
                    </h3>
                    <p className="text-gray-900 capitalize">
                      {recommendation.input.season}
                    </p>
                  </div>
                )}
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
                  <div className="relative max-w-md">
                    <Image
                      src={recommendation.input.imageUrl}
                      alt="Submitted field image"
                      width={500}
                      height={400}
                      className="rounded-lg border border-gray-200 object-cover"
                      unoptimized
                    />
                  </div>
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

        <div className="text-sm text-gray-500 text-center py-4 print:hidden">
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
