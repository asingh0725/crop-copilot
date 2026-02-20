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
import { SecureImage } from "@/components/recommendations/secure-image";
import { upsertRecommendationProductsFromDiagnosis } from "@/lib/services/recommendation-products";
import type {
  ActionItem,
  ConditionType,
  Diagnosis,
  FullRecommendation,
  ProductSuggestion,
} from "@/lib/utils/format-diagnosis";

interface RecommendationPageProps {
  params: {
    id: string;
  };
}

interface RecommendationSourceView {
  id: string;
  chunkId: string | null;
  type: string;
  content?: string | null;
  imageUrl?: string | null;
  relevanceScore: number | null;
  source: {
    id: string;
    title: string;
    type: string;
    url: string | null;
    publisher?: string | null;
    publishedDate?: string | null;
  } | null;
}

function inferConditionType(
  maybeType: unknown,
  condition: string
): ConditionType {
  if (
    maybeType === "deficiency" ||
    maybeType === "disease" ||
    maybeType === "pest" ||
    maybeType === "environmental" ||
    maybeType === "unknown"
  ) {
    return maybeType;
  }

  const lowered = condition.toLowerCase();
  if (/(deficien|chlorosis|nutrient)/.test(lowered)) {
    return "deficiency";
  }
  if (/(pest|insect|mite|aphid|worm|beetle|bug)/.test(lowered)) {
    return "pest";
  }
  if (/(drought|heat|cold|frost|water|environment)/.test(lowered)) {
    return "environmental";
  }
  if (/(disease|blight|rust|mold|fung|bacter|viral|pathogen)/.test(lowered)) {
    return "disease";
  }

  return "unknown";
}

function normalizeDiagnosisPayload(
  rawDiagnosis: unknown,
  confidence: number,
  directRecommendedProducts: Array<{
    id: string;
    catalogProductId?: string;
    productId?: string;
    name: string;
    type: string;
    reason: string | null;
    applicationRate: string | null;
  }> = []
): FullRecommendation {
  const record =
    rawDiagnosis && typeof rawDiagnosis === "object"
      ? (rawDiagnosis as Record<string, unknown>)
      : {};

  const diagnosisRecord =
    record.diagnosis && typeof record.diagnosis === "object"
      ? (record.diagnosis as Record<string, unknown>)
      : record;

  const condition =
    (diagnosisRecord.condition as string | undefined) ||
    (record.condition as string | undefined) ||
    "Unknown condition";
  const reasoning =
    (diagnosisRecord.reasoning as string | undefined) ||
    (diagnosisRecord.summary as string | undefined) ||
    (record.summary as string | undefined) ||
    "No diagnostic reasoning was generated.";

  const diagnosis: Diagnosis = {
    condition,
    conditionType: inferConditionType(diagnosisRecord.conditionType, condition),
    confidence,
    reasoning,
  };

  const recommendations: ActionItem[] = Array.isArray(record.recommendations)
    ? (record.recommendations as ActionItem[])
    : [];

  const normalizeProduct = (entry: unknown): ProductSuggestion | null => {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const record = entry as Record<string, unknown>;
    const nestedString =
      typeof record.product === "string" ? record.product.trim() : null;
    const nested =
      record.product && typeof record.product === "object"
        ? (record.product as Record<string, unknown>)
        : null;

    const productId =
      (record.productId as string | undefined) ??
      (record.product_id as string | undefined) ??
      (record.id as string | undefined) ??
      (nested?.id as string | undefined);
    const productName =
      (record.productName as string | undefined) ??
      (record.product_name as string | undefined) ??
      (record.name as string | undefined) ??
      nestedString ??
      (nested?.name as string | undefined) ??
      "Suggested product";
    const reason =
      (record.reason as string | undefined) ??
      (record.reasoning as string | undefined) ??
      `Recommended for ${String(
        (record.productType as string | undefined) ??
          (record.product_type as string | undefined) ??
          (nested?.type as string | undefined) ??
          "crop"
      ).toLowerCase()} management.`;
    const applicationRate =
      (record.applicationRate as string | undefined) ??
      (record.application_rate as string | undefined) ??
      (nested?.applicationRate as string | undefined) ??
      (nested?.application_rate as string | undefined);

    return {
      productId,
      catalogProductId:
        typeof productId === "string" && productId.trim().length > 0
          ? productId
          : null,
      productName,
      name: productName,
      reason,
      applicationRate,
    };
  };

  const diagnosisProducts = Array.isArray(record.products)
    ? (record.products as unknown[]).map(normalizeProduct).filter(Boolean) as ProductSuggestion[]
    : [];

  const directProducts = directRecommendedProducts.map((product) => ({
    productId: product.productId ?? product.id,
    catalogProductId: product.catalogProductId ?? product.productId ?? product.id,
    productName: product.name,
    name: product.name,
    reason:
      product.reason ??
      `Recommended for ${product.type.toLowerCase()} management.`,
    applicationRate: product.applicationRate ?? undefined,
  }));

  const productsByKey = new Map<string, ProductSuggestion>();
  [...directProducts, ...diagnosisProducts].forEach((product) => {
    const key =
      product.catalogProductId ||
      product.productId ||
      product.productName ||
      product.name ||
      `product-${productsByKey.size + 1}`;
    if (!productsByKey.has(key)) {
      productsByKey.set(key, product);
    }
  });

  const products = Array.from(productsByKey.values());

  return {
    diagnosis,
    recommendations,
    products,
    confidence,
  };
}

function buildFallbackSources(rawDiagnosis: unknown): RecommendationSourceView[] {
  const record =
    rawDiagnosis && typeof rawDiagnosis === "object"
      ? (rawDiagnosis as Record<string, unknown>)
      : {};

  const evidencePreview = Array.isArray(record.evidencePreview)
    ? (record.evidencePreview as unknown[])
    : [];

  const fallbackSources: RecommendationSourceView[] = [];
  for (let index = 0; index < evidencePreview.length; index += 1) {
    const entry = evidencePreview[index];
    if (typeof entry !== "string" || entry.trim().length === 0) {
      continue;
    }

    fallbackSources.push({
      id: `fallback-source-${index + 1}`,
      chunkId: null,
      type: "text",
      content: entry,
      imageUrl: null,
      relevanceScore: null,
        source: {
          id: `fallback-source-doc-${index + 1}`,
          title: `Evidence ${index + 1}`,
          type: "GENERATED",
          url: null,
          publisher: "Research Source",
          publishedDate: null,
        },
      });
  }

  return fallbackSources;
}

function isGenericProductLabel(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  return (
    normalized.length === 0 ||
    normalized === "suggested product" ||
    normalized === "unspecified" ||
    normalized === "unknown product" ||
    normalized === "product"
  );
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
      products: {
        include: {
          product: true,
        },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
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
        products: {
          include: {
            product: true,
          },
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
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

  type RecommendationProductRow = {
    reason: string | null;
    applicationRate: string | null;
    priority: number;
    product: {
      id: string;
      name: string;
      brand: string | null;
      type: string;
    };
  };

  let productRows: RecommendationProductRow[] = recommendation.products.map((entry) => ({
    reason: entry.reason,
    applicationRate: entry.applicationRate,
    priority: entry.priority,
    product: {
      id: entry.product.id,
      name: entry.product.name,
      brand: entry.product.brand,
      type: entry.product.type,
    },
  }));
  const hasSpecificProductRow = productRows.some(
    (entry) => !isGenericProductLabel(entry.product?.name)
  );
  if (hasSpecificProductRow) {
    productRows = productRows.filter(
      (entry) => !isGenericProductLabel(entry.product?.name)
    );
  }
  const shouldBackfillProducts =
    productRows.length === 0 ||
    productRows.every((entry) => isGenericProductLabel(entry.product?.name));

  if (shouldBackfillProducts) {
    try {
      const backfilled = await upsertRecommendationProductsFromDiagnosis({
        recommendationId: recommendation.id,
        diagnosis: recommendation.diagnosis,
        crop: recommendation.input.crop,
      });
      if (backfilled.length > 0) {
        productRows = backfilled.map((entry) => ({
          reason: entry.reason,
          applicationRate: entry.applicationRate,
          priority: entry.priority,
          product: {
            id: entry.product.id,
            name: entry.product.name,
            brand: entry.product.brand,
            type: entry.product.type,
          },
        }));
      }
    } catch (error) {
      console.error("Recommendation product backfill failed (page):", error);
    }
  }

  // Format response with all necessary data
  const recommendedProducts = productRows.map((entry) => ({
    id: entry.product.id,
    catalogProductId: entry.product.id,
    productId: entry.product.id,
    name: entry.product.name,
    type: entry.product.type,
    reason: entry.reason,
    applicationRate: entry.applicationRate,
  }));

  return {
    id: recommendation.id,
    createdAt: recommendation.createdAt,
    diagnosis: recommendation.diagnosis,
    confidence: recommendation.confidence,
    modelUsed: recommendation.modelUsed,
    recommendedProducts,
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

  const fullRecommendation = normalizeDiagnosisPayload(
    recommendation.diagnosis,
    recommendation.confidence,
    recommendation.recommendedProducts
  );
  const diagnosis = fullRecommendation.diagnosis;
  const actionItems = fullRecommendation.recommendations || [];
  const products = fullRecommendation.products || [];
  const displaySources =
    recommendation.sources.length > 0
      ? recommendation.sources
      : buildFallbackSources(recommendation.diagnosis);

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
          sources={displaySources}
          products={products}
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
                    <SecureImage
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
