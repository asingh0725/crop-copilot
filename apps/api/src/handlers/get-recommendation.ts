import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

interface RecommendationRow {
  id: string;
  created_at: Date | string;
  diagnosis: unknown;
  confidence: number;
  model_used: string;
  input_id: string;
  input_type: string;
  input_description: string | null;
  input_image_url: string | null;
  input_lab_data: unknown;
  input_crop: string | null;
  input_location: string | null;
  input_season: string | null;
  input_created_at: Date | string;
}

interface RecommendationSourceRow {
  id: string;
  text_chunk_id: string | null;
  image_chunk_id: string | null;
  relevance_score: number | null;
  text_content: string | null;
  image_caption: string | null;
  image_url: string | null;
  source_id: string | null;
  source_title: string | null;
  source_type: string | null;
  source_url: string | null;
  source_institution: string | null;
  source_metadata: unknown;
}

interface ProductRecommendationRow {
  product_id: string;
  product_name: string;
  product_brand: string | null;
  product_type: string;
  recommendation_reason: string | null;
  application_rate: string | null;
  priority: number;
}

interface DiagnosisProduct {
  productId?: unknown;
  product_id?: unknown;
  id?: unknown;
  productName?: unknown;
  product_name?: unknown;
  name?: unknown;
  productType?: unknown;
  product_type?: unknown;
  type?: unknown;
  reasoning?: unknown;
  reason?: unknown;
  applicationRate?: unknown;
  application_rate?: unknown;
  alternatives?: unknown;
  alternativeIds?: unknown;
  product?: unknown;
  priority?: unknown;
}

let recommendationDetailPool: Pool | null = null;
const CONDITION_TYPES = new Set([
  'deficiency',
  'disease',
  'pest',
  'environmental',
  'unknown',
]);
const DEFAULT_SOURCE_LIMIT = 40;

function getRecommendationDetailPool(): Pool {
  if (!recommendationDetailPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for recommendation details');
    }

    recommendationDetailPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 6),
      ssl: resolvePoolSslConfig(),
    });
  }

  return recommendationDetailPool;
}

function toIsoString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString();
}

function getPublishedDate(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const raw = record.publishedDate;
  if (typeof raw !== 'string') {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function inferConditionType(
  rawConditionType: unknown,
  condition: unknown,
  reasoning: unknown
): string {
  if (typeof rawConditionType === 'string' && CONDITION_TYPES.has(rawConditionType)) {
    return rawConditionType;
  }

  const text = [condition, reasoning]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (/(deficien|chlorosis|nutrient)/.test(text)) return 'deficiency';
  if (/(pest|insect|mite|aphid|worm|beetle|bug)/.test(text)) return 'pest';
  if (/(drought|heat|cold|frost|water|environment)/.test(text)) return 'environmental';
  if (/(disease|blight|rust|mold|fung|bacter|viral|pathogen)/.test(text)) return 'disease';
  return 'unknown';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function extractDiagnosisProducts(
  base: Record<string, unknown>,
  diagnosisNode: Record<string, unknown>
): DiagnosisProduct[] {
  const candidates = [
    base.products,
    base.recommendedProducts,
    base.productRecommendations,
    diagnosisNode.products,
    diagnosisNode.recommendedProducts,
    diagnosisNode.productRecommendations,
  ];

  for (const value of candidates) {
    if (!Array.isArray(value)) {
      continue;
    }

    return value as DiagnosisProduct[];
  }

  return [];
}

const recommendationSelectQuery = `
  SELECT
    r.id,
    r."createdAt" AS created_at,
    r.diagnosis,
    r.confidence,
    r."modelUsed" AS model_used,
    i.id AS input_id,
    i.type AS input_type,
    i.description AS input_description,
    i."imageUrl" AS input_image_url,
    i."labData" AS input_lab_data,
    i.crop AS input_crop,
    i.location AS input_location,
    i.season AS input_season,
    i."createdAt" AS input_created_at
  FROM "Recommendation" r
  JOIN "Input" i ON i.id = r."inputId"
  WHERE r."userId" = $2
    AND r.id = $1
  LIMIT 1
`;

const recommendationByInputQuery = `
  SELECT
    r.id,
    r."createdAt" AS created_at,
    r.diagnosis,
    r.confidence,
    r."modelUsed" AS model_used,
    i.id AS input_id,
    i.type AS input_type,
    i.description AS input_description,
    i."imageUrl" AS input_image_url,
    i."labData" AS input_lab_data,
    i.crop AS input_crop,
    i.location AS input_location,
    i.season AS input_season,
    i."createdAt" AS input_created_at
  FROM "Recommendation" r
  JOIN "Input" i ON i.id = r."inputId"
  WHERE r."userId" = $2
    AND r."inputId" = $1
  LIMIT 1
`;

const recommendationSourcesQuery = `
  SELECT
    rs.id,
    rs."textChunkId" AS text_chunk_id,
    rs."imageChunkId" AS image_chunk_id,
    rs."relevanceScore" AS relevance_score,
    tc.content AS text_content,
    ic.caption AS image_caption,
    ic."imageUrl" AS image_url,
    s.id AS source_id,
    s.title AS source_title,
    s."sourceType" AS source_type,
    s.url AS source_url,
    s.institution AS source_institution,
    s.metadata AS source_metadata
  FROM "RecommendationSource" rs
  LEFT JOIN "TextChunk" tc ON tc.id = rs."textChunkId"
  LEFT JOIN "ImageChunk" ic ON ic.id = rs."imageChunkId"
  LEFT JOIN "Source" s ON s.id = COALESCE(tc."sourceId", ic."sourceId")
  WHERE rs."recommendationId" = $1
  ORDER BY rs."relevanceScore" DESC NULLS LAST, rs.id ASC
  LIMIT $2
`;

const recommendationProductsQuery = `
  SELECT
    pr."productId" AS product_id,
    p.name AS product_name,
    p.brand AS product_brand,
    p.type AS product_type,
    pr.reason AS recommendation_reason,
    pr."applicationRate" AS application_rate,
    pr.priority
  FROM "ProductRecommendation" pr
  JOIN "Product" p ON p.id = pr."productId"
  WHERE pr."recommendationId" = $1
  ORDER BY pr.priority ASC, pr."createdAt" ASC
`;

function normalizeDiagnosisPayload(
  diagnosis: unknown,
  productRows: ProductRecommendationRow[]
): Record<string, unknown> {
  const fallback: Record<string, unknown> = {
    diagnosis: {
      condition: 'Unknown condition',
      conditionType: 'unknown',
      confidence: 0,
      reasoning: 'No diagnostic reasoning was returned yet.',
    },
    recommendations: [],
    products: [],
    confidence: 0,
  };

  const parseStringifiedDiagnosis = (
    value: unknown
  ): Record<string, unknown> | null => {
    if (!value || typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  };

  const parsedStringDiagnosis = parseStringifiedDiagnosis(diagnosis);

  const base =
    diagnosis && typeof diagnosis === 'object'
      ? { ...(diagnosis as Record<string, unknown>) }
      : parsedStringDiagnosis ?? fallback;
  const diagnosisNode =
    base.diagnosis && typeof base.diagnosis === 'object'
      ? { ...(base.diagnosis as Record<string, unknown>) }
      : {};
  const condition =
    (typeof diagnosisNode.condition === 'string' && diagnosisNode.condition) ||
    (typeof base.condition === 'string' && base.condition) ||
    'Unknown condition';
  const reasoning =
    (typeof diagnosisNode.reasoning === 'string' && diagnosisNode.reasoning) ||
    (typeof base.reasoning === 'string' && base.reasoning) ||
    'No diagnostic reasoning was returned yet.';
  const inferredConditionType = inferConditionType(
    diagnosisNode.conditionType ?? base.conditionType,
    condition,
    reasoning
  );
  const normalizedConfidence = asNumber(diagnosisNode.confidence) ?? asNumber(base.confidence) ?? 0;

  base.diagnosis = {
    ...diagnosisNode,
    condition,
    conditionType: inferredConditionType,
    confidence: normalizedConfidence,
    reasoning,
  };
  base.confidence = normalizedConfidence;
  const products = extractDiagnosisProducts(base, diagnosisNode);
  base.products = products;

  if (products.length === 0 && productRows.length > 0) {
    base.products = productRows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      productType: row.product_type,
      applicationRate: row.application_rate,
      reasoning:
        row.recommendation_reason ??
        `Recommended for ${row.product_type.toLowerCase()} management.`,
      priority: row.priority,
      brand: row.product_brand,
    }));
  }

  if (!Array.isArray(base.recommendations)) {
    base.recommendations = [];
  }

  return base;
}

function parseSourceLimit(rawValue: string | undefined): number {
  if (!rawValue) {
    return DEFAULT_SOURCE_LIMIT;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SOURCE_LIMIT;
  }

  return Math.min(parsed, 100);
}

function buildRecommendedProductsFromDiagnosis(
  normalizedDiagnosis: Record<string, unknown>
): Array<{
  id: string;
  name: string;
  brand: string | null;
  type: string;
  reason: string;
  applicationRate: string | null;
  priority: number;
}> {
  const rawProducts = Array.isArray(normalizedDiagnosis.products)
    ? (normalizedDiagnosis.products as DiagnosisProduct[])
    : [];

  const resolved = rawProducts.flatMap((entry, index) => {
      const nested = asRecord(entry.product);
      const rawId =
        asString(entry.productId) ??
        asString(entry.product_id) ??
        asString(entry.id) ??
        asString(nested?.id) ??
        null;
      const rawName =
        asString(entry.productName) ??
        asString(entry.product_name) ??
        asString(entry.name) ??
        asString(nested?.name) ??
        null;
      const rawType =
        asString(entry.productType) ??
        asString(entry.product_type) ??
        asString(entry.type) ??
        asString(nested?.type) ??
        'UNKNOWN';
      const rawReason =
        asString(entry.reasoning) ??
        asString(entry.reason) ??
        `Recommended for ${rawType.toLowerCase()} management.`;
      const rawRate =
        asString(entry.applicationRate) ??
        asString(entry.application_rate) ??
        asString(nested?.applicationRate) ??
        asString(nested?.application_rate) ??
        null;
      const parsedPriority = asNumber(entry.priority);
      const rawPriority =
        parsedPriority !== null ? Math.max(1, Math.floor(parsedPriority)) : index + 1;

      if (!rawName || rawName.trim().length === 0) {
        return [];
      }

      return [
        {
          id: rawId && rawId.trim().length > 0 ? rawId : `diag-product-${index + 1}`,
          name: rawName.trim(),
          brand: null as string | null,
          type: rawType,
          reason: rawReason,
          applicationRate: rawRate,
          priority: rawPriority,
        },
      ];
    });

  return resolved.sort((left, right) => left.priority - right.priority);
}

export function buildGetRecommendationHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    const recommendationId = event.pathParameters?.id;
    if (!recommendationId) {
      return jsonResponse(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Recommendation id is required',
          },
        },
        { statusCode: 400 }
      );
    }

    const pool = getRecommendationDetailPool();
    const sourceLimit = parseSourceLimit(process.env.RECOMMENDATION_SOURCES_LIMIT);

    try {
      let recommendationResult = await pool.query<RecommendationRow>(
        recommendationSelectQuery,
        [recommendationId, auth.userId]
      );

      if (recommendationResult.rows.length === 0) {
        recommendationResult = await pool.query<RecommendationRow>(
          recommendationByInputQuery,
          [recommendationId, auth.userId]
        );
      }

      if (recommendationResult.rows.length === 0) {
        return jsonResponse(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Recommendation not found',
            },
          },
          { statusCode: 404 }
        );
      }

      const recommendation = recommendationResult.rows[0];
      const [sourcesResult, productsResult] = await Promise.all([
        pool.query<RecommendationSourceRow>(recommendationSourcesQuery, [
          recommendation.id,
          sourceLimit,
        ]),
        pool.query<ProductRecommendationRow>(recommendationProductsQuery, [recommendation.id]),
      ]);

      const sources = sourcesResult.rows.map((row) => ({
        id: row.id,
        chunkId: row.text_chunk_id ?? row.image_chunk_id,
        type: row.text_chunk_id ? 'text' : 'image',
        content: row.text_content ?? row.image_caption,
        imageUrl: row.image_url,
        relevanceScore: row.relevance_score,
        source: row.source_id
          ? {
              id: row.source_id,
              title: row.source_title ?? 'Unknown source',
              type: row.source_type ?? 'UNKNOWN',
              url: row.source_url,
              publisher: row.source_institution,
              publishedDate: getPublishedDate(row.source_metadata),
            }
          : null,
      }));

      const normalizedDiagnosis = normalizeDiagnosisPayload(
        recommendation.diagnosis,
        productsResult.rows
      );
      const recommendedProducts =
        productsResult.rows.length > 0
          ? productsResult.rows.map((row) => ({
              id: row.product_id,
              name: row.product_name,
              brand: row.product_brand,
              type: row.product_type,
              reason:
                row.recommendation_reason ??
                `Recommended for ${row.product_type.toLowerCase()} management.`,
              applicationRate: row.application_rate,
              priority: row.priority,
            }))
          : buildRecommendedProductsFromDiagnosis(normalizedDiagnosis);

      return jsonResponse(
        {
          id: recommendation.id,
          createdAt: toIsoString(recommendation.created_at),
          diagnosis: normalizedDiagnosis,
          confidence: recommendation.confidence,
          modelUsed: recommendation.model_used,
          input: {
            id: recommendation.input_id,
            type: recommendation.input_type,
            description: recommendation.input_description,
            imageUrl: recommendation.input_image_url,
            labData: recommendation.input_lab_data,
            crop: recommendation.input_crop,
            location: recommendation.input_location,
            season: recommendation.input_season,
            createdAt: toIsoString(recommendation.input_created_at),
          },
          sources,
          recommendedProducts,
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('Failed to fetch recommendation details', {
        recommendationId,
        userId: auth.userId,
        error: (error as Error).message,
      });

      return jsonResponse(
        {
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Internal server error',
          },
        },
        { statusCode: 500 }
      );
    }
  }, verifier);
}

export const handler = buildGetRecommendationHandler();
