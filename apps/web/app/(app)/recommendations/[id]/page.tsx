import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createApiClient, ApiClientError } from "@/lib/api-client";
import { DiagnosisDisplay } from "@/components/recommendations/diagnosis-display";
import { RecommendationContent } from "@/components/recommendations/recommendation-content";
import { RecommendationFeedbackFlow } from "@/components/recommendations/recommendation-feedback-flow";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SecureImage } from "@/components/recommendations/secure-image";
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

interface PremiumRecommendationView {
  status: "not_available" | "queued" | "processing" | "ready" | "failed";
  riskReview: "clear_signal" | "potential_conflict" | "needs_manual_verification" | null;
  complianceDecision?: "clear_signal" | "potential_conflict" | "needs_manual_verification" | null;
  checks: Array<{
    id: string;
    title: string;
    result: "clear_signal" | "potential_conflict" | "needs_manual_verification";
    message: string;
  }>;
  costAnalysis: {
    perAcreTotalUsd: number | null;
    wholeFieldTotalUsd: number | null;
    swapOptions?: Array<{
      fromProductName: string;
      toProductName: string;
      estimatedSavingsPerAcreUsd: number;
      estimatedSavingsWholeFieldUsd: number;
    }>;
  } | null;
  sprayWindows: Array<{
    startsAt: string;
    endsAt: string;
    score: number;
    summary: string;
    source: string;
  }>;
  report: {
    html?: string;
    htmlUrl?: string;
    pdfUrl?: string;
    generatedAt?: string;
  } | null;
  advisoryNotice?: string | null;
  failureReason?: string | null;
}

function getDefaultPremiumRecommendation(): PremiumRecommendationView {
  return {
    status: "not_available",
    riskReview: null,
    complianceDecision: null,
    checks: [],
    costAnalysis: null,
    sprayWindows: [],
    report: null,
    advisoryNotice:
      "Decision support only. Verify label instructions and local regulations before application.",
    failureReason: null,
  };
}

function formatRiskReviewLabel(
  decision: PremiumRecommendationView["riskReview"]
): string {
  switch (decision) {
    case "clear_signal":
      return "Clear Signal";
    case "potential_conflict":
      return "Potential Conflict";
    case "needs_manual_verification":
      return "Needs Manual Verification";
    default:
      return "N/A";
  }
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

async function getRecommendation(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const client = createApiClient(session?.access_token ?? "");

  try {
    const rec = await client.get<{
      id: string;
      createdAt: string;
      diagnosis: unknown;
      confidence: number;
      modelUsed: string;
      input: {
        id: string;
        type: string;
        description: string | null;
        imageUrl: string | null;
        labData: unknown;
        crop: string | null;
        location: string | null;
        season: string | null;
        fieldAcreage: number | null;
        plannedApplicationDate: string | null;
        fieldLatitude: number | null;
        fieldLongitude: number | null;
        createdAt: string;
      };
      sources: RecommendationSourceView[];
      recommendedProducts: Array<{
        id: string;
        catalogProductId?: string | null;
        name: string;
        brand: string | null;
        type: string;
        reason: string | null;
        applicationRate: string | null;
        priority: number;
      }>;
      premium: PremiumRecommendationView;
    }>(`/api/v1/recommendations/${id}`);

    return {
      id: rec.id,
      createdAt: rec.createdAt,
      diagnosis: rec.diagnosis,
      confidence: rec.confidence,
      modelUsed: rec.modelUsed,
      recommendedProducts: (rec.recommendedProducts ?? []).map((p) => ({
        id: p.id,
        // Prefer the explicit catalogProductId from the API (a real DB UUID).
        // Fall back to p.id only if catalogProductId is absent — normalizeCatalogId
        // in product-suggestions.tsx will reject non-UUID strings anyway.
        catalogProductId: p.catalogProductId ?? p.id,
        productId: p.catalogProductId ?? p.id,
        name: p.name,
        type: p.type,
        reason: p.reason,
        applicationRate: p.applicationRate,
      })),
      input: rec.input,
      sources: rec.sources,
      premium: rec.premium ?? getDefaultPremiumRecommendation(),
    };
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) {
      return null;
    }
    throw err;
  }
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
        <RecommendationFeedbackFlow recommendationId={recommendation.id} />

        <Card className="print:shadow-none print:border-gray-300">
          <CardHeader>
            <h2 className="text-xl font-semibold">Premium Insights</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {recommendation.premium.status === "not_available" && (
              <p className="text-gray-700">
                Grower Pro unlocks application risk review, cost optimization, spray-window alerts, and a one-tap application prep packet.{" "}
                <Link href="/settings/billing" className="text-green-700 underline">
                  Upgrade to Pro
                </Link>
                .
              </p>
            )}

            {(recommendation.premium.status === "queued" ||
              recommendation.premium.status === "processing") && (
              <p className="text-gray-700">
                Premium risk review is {recommendation.premium.status}. Refresh in a few seconds.
              </p>
            )}

            {recommendation.premium.status === "failed" && (
              <p className="text-red-700">
                Premium analysis failed: {recommendation.premium.failureReason ?? "Unknown error"}
              </p>
            )}

            {recommendation.premium.status === "ready" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500 mb-1">Application Risk Review</p>
                    <p className="font-semibold uppercase">
                      {formatRiskReviewLabel(recommendation.premium.riskReview)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500 mb-1">Per-Acre Cost</p>
                    <p className="font-semibold">
                      {recommendation.premium.costAnalysis?.perAcreTotalUsd != null
                        ? `$${recommendation.premium.costAnalysis.perAcreTotalUsd.toFixed(2)}`
                        : "N/A"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500 mb-1">Whole-Field Cost</p>
                    <p className="font-semibold">
                      {recommendation.premium.costAnalysis?.wholeFieldTotalUsd != null
                        ? `$${recommendation.premium.costAnalysis.wholeFieldTotalUsd.toFixed(2)}`
                        : "N/A"}
                    </p>
                  </div>
                </div>

                {recommendation.premium.checks.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-800">Risk Checks (Advisory)</h3>
                    <div className="space-y-2">
                      {recommendation.premium.checks.map((check) => (
                        <div key={check.id} className="rounded-md border border-gray-200 p-2">
                          <p className="text-sm font-medium">
                            {check.title}{" "}
                            <span className="uppercase text-xs text-gray-500">
                              ({formatRiskReviewLabel(check.result)})
                            </span>
                          </p>
                          <p className="text-sm text-gray-600">{check.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {recommendation.premium.advisoryNotice ??
                    "Decision support only. Verify labels and local regulations before application."}
                </div>

                {recommendation.premium.sprayWindows.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-800">Spray Windows</h3>
                    <div className="space-y-2">
                      {recommendation.premium.sprayWindows.slice(0, 3).map((window, idx) => (
                        <div key={`${window.startsAt}-${idx}`} className="rounded-md border border-gray-200 p-2">
                          <p className="text-sm font-medium">
                            {new Date(window.startsAt).toLocaleString("en-US")} -{" "}
                            {new Date(window.endsAt).toLocaleString("en-US")}
                          </p>
                          <p className="text-sm text-gray-600">
                            Score: {window.score} · {window.summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {recommendation.premium.report?.html && (
                  <details className="rounded-md border border-gray-200 p-3">
                    <summary className="cursor-pointer text-sm font-semibold">Application Prep Packet Preview</summary>
                    <pre className="mt-3 max-h-72 overflow-auto bg-gray-50 p-3 text-xs">
                      {recommendation.premium.report.html}
                    </pre>
                  </details>
                )}
              </>
            )}
          </CardContent>
        </Card>

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
                {recommendation.input.fieldAcreage != null && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-1">
                      Field Acreage
                    </h3>
                    <p className="text-gray-900">
                      {recommendation.input.fieldAcreage.toLocaleString("en-US", {
                        maximumFractionDigits: 2,
                      })} acres
                    </p>
                  </div>
                )}
                {recommendation.input.plannedApplicationDate && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-1">
                      Planned Application Date
                    </h3>
                    <p className="text-gray-900">
                      {new Date(
                        recommendation.input.plannedApplicationDate
                      ).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                )}
                {recommendation.input.fieldLatitude != null &&
                  recommendation.input.fieldLongitude != null && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">
                        Field Coordinates
                      </h3>
                      <p className="text-gray-900">
                        {recommendation.input.fieldLatitude.toFixed(5)},{" "}
                        {recommendation.input.fieldLongitude.toFixed(5)}
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

              {!!recommendation.input.labData && (
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
