import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  CostAnalysisResult,
  PremiumInsightPayload,
  PremiumProcessingInput,
  PremiumStatus,
  RiskReviewDecision,
} from './types';
import { DEFAULT_ADVISORY_NOTICE as defaultAdvisoryNotice } from './types';
import type { ComplianceEvaluationResult } from './compliance-engine';
import { searchLivePricing, type PricingOffer } from '../lib/pricing-search';

interface ProcessingRow {
  recommendation_id: string;
  user_id: string;
  recommendation_diagnosis: unknown;
  recommendation_confidence: number | null;
  recommendation_model_used: string | null;
  input_crop: string | null;
  input_location: string | null;
  input_season: string | null;
  input_field_acreage: number | null;
  input_planned_application_date: Date | null;
  input_field_latitude: number | null;
  input_field_longitude: number | null;
}

interface ProductRow {
  product_id: string;
  product_name: string;
  product_type: string;
  application_rate: string | null;
  reason: string | null;
}

interface FallbackProductRow {
  product_id: string;
  product_name: string;
  product_type: string;
  application_rate: string | null;
}

interface PricingCacheRow {
  product_id: string;
  pricing: unknown;
}

interface PricingProductRow {
  product_id: string;
  product_name: string;
  product_brand: string | null;
  product_type: string;
}

interface SourceSignalRow {
  source_type: string | null;
  source_title: string | null;
  chunk_content: string | null;
}

interface PremiumInsightRow {
  status: PremiumStatus;
  compliance_decision:
    | 'pass'
    | 'block'
    | 'review'
    | 'clear_signal'
    | 'potential_conflict'
    | 'needs_manual_verification'
    | null;
  checks: unknown;
  cost_analysis: unknown;
  spray_windows: unknown;
  report: unknown;
  failure_reason: string | null;
  updated_at: Date;
}

type PersistedDecision =
  | 'pass'
  | 'block'
  | 'review'
  | 'clear_signal'
  | 'potential_conflict'
  | 'needs_manual_verification';

function normalizeRegionKey(region: string): string {
  return region.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeRiskReviewDecision(value: string | null | undefined): RiskReviewDecision | null {
  if (!value) {
    return null;
  }

  switch (value) {
    case 'pass':
      return 'clear_signal';
    case 'block':
      return 'potential_conflict';
    case 'review':
      return 'needs_manual_verification';
    case 'clear_signal':
    case 'potential_conflict':
    case 'needs_manual_verification':
      return value;
    default:
      return null;
  }
}

function toPersistedDecision(
  value: RiskReviewDecision | 'pass' | 'block' | 'review' | null | undefined
): PersistedDecision | null {
  if (!value) {
    return null;
  }

  switch (value) {
    case 'pass':
      return 'clear_signal';
    case 'block':
      return 'potential_conflict';
    case 'review':
      return 'needs_manual_verification';
    case 'clear_signal':
    case 'potential_conflict':
    case 'needs_manual_verification':
      return value;
    default:
      return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCropTerm(crop: string | null): string {
  return (crop ?? '').trim().toLowerCase();
}

const CROP_ALIAS_MAP: Record<string, string[]> = {
  corn:         ['maize', 'zea mays'],
  soybeans:     ['soybean', 'soya', 'glycine max'],
  wheat:        ['triticum', 'winter wheat', 'spring wheat', 'hard red wheat', 'soft red wheat'],
  cotton:       ['gossypium', 'upland cotton', 'pima cotton'],
  rice:         ['oryza', 'paddy rice', 'paddy'],
  sorghum:      ['milo', 'grain sorghum', 'sudangrass', 'sorghum bicolor'],
  barley:       ['hordeum', 'hordeum vulgare', 'malting barley'],
  oats:         ['avena', 'avena sativa'],
  rye:          ['secale', 'secale cereale', 'winter rye'],
  millet:       ['panicum', 'pennisetum', 'foxtail millet', 'pearl millet', 'proso millet'],
  sunflower:    ['helianthus', 'sunflowers', 'confection sunflower', 'oilseed sunflower'],
  canola:       ['rapeseed', 'brassica napus', 'rape', 'oilseed rape'],
  alfalfa:      ['lucerne', 'medicago', 'medicago sativa'],
  sugarcane:    ['saccharum', 'sugar cane'],
  tobacco:      ['nicotiana', 'nicotiana tabacum', 'burley tobacco', 'flue-cured tobacco'],
  peanuts:      ['groundnuts', 'groundnut', 'arachis', 'arachis hypogaea', 'peanut'],
  tomatoes:     ['tomato', 'lycopersicon', 'solanum lycopersicum'],
  potatoes:     ['potato', 'solanum tuberosum', 'spud'],
  peppers:      ['pepper', 'capsicum', 'bell pepper', 'chili pepper', 'sweet pepper'],
  cucumbers:    ['cucumber', 'cucumis', 'cucumis sativus'],
  onions:       ['onion', 'allium cepa', 'allium'],
  carrots:      ['carrot', 'daucus', 'daucus carota'],
  lettuce:      ['lactuca', 'lactuca sativa', 'romaine', 'iceberg'],
  broccoli:     ['brassica oleracea', 'calabrese'],
  apples:       ['apple', 'malus', 'malus domestica'],
  grapes:       ['grape', 'vitis', 'grapevine', 'viticulture', 'vineyard'],
  strawberries: ['strawberry', 'fragaria'],
  peaches:      ['peach', 'prunus persica', 'nectarine'],
  almonds:      ['almond', 'prunus dulcis', 'prunus amygdalus'],
  blueberries:  ['blueberry', 'vaccinium', 'highbush blueberry', 'lowbush blueberry'],
};

function buildCropHints(cropTerm: string): string[] {
  if (!cropTerm) {
    return [];
  }
  const hints = new Set<string>([cropTerm]);
  // Add simple singular/plural
  if (cropTerm.endsWith('s')) {
    hints.add(cropTerm.slice(0, -1));
  } else {
    hints.add(`${cropTerm}s`);
  }
  // Add known aliases
  const aliases = CROP_ALIAS_MAP[cropTerm] ?? [];
  for (const alias of aliases) {
    hints.add(alias);
  }
  return [...hints];
}

function extractDiagnosisSummary(diagnosisPayload: unknown): {
  condition: string | null;
  conditionType: string | null;
} {
  const root = asRecord(diagnosisPayload);
  if (!root) {
    return { condition: null, conditionType: null };
  }

  const diagnosisNode = asRecord(root.diagnosis) ?? root;
  return {
    condition: asString(diagnosisNode.condition),
    conditionType: asString(diagnosisNode.conditionType),
  };
}

function inferFallbackProductTypes(conditionType: string | null): string[] {
  switch ((conditionType ?? '').toLowerCase()) {
    case 'deficiency':
      return ['FERTILIZER', 'AMENDMENT'];
    case 'disease':
      return ['FUNGICIDE', 'BIOLOGICAL'];
    case 'pest':
      return ['INSECTICIDE', 'BIOLOGICAL'];
    case 'environmental':
      return ['AMENDMENT', 'BIOLOGICAL'];
    default:
      return ['BIOLOGICAL', 'FUNGICIDE', 'INSECTICIDE', 'AMENDMENT', 'FERTILIZER'];
  }
}

function computeSourceSignals(
  sourceRows: SourceSignalRow[],
  crop: string | null
): {
  totalSources: number;
  cropAlignedSources: number;
  governmentSources: number;
  policyLikeSources: number;
} {
  const cropHints = buildCropHints(normalizeCropTerm(crop));
  const cropPattern =
    cropHints.length > 0
      ? new RegExp(`(^|[^a-z0-9])(?:${cropHints.map(escapeRegExp).join('|')})([^a-z0-9]|$)`, 'i')
      : null;
  const policyPattern =
    /(registered for use|regulation|regulations|code of|chapter|statute|administrative|certification manual|rules of|pesticide act|licensing)/i;

  let cropAlignedSources = 0;
  let governmentSources = 0;
  let policyLikeSources = 0;

  for (const row of sourceRows) {
    const title = row.source_title ?? '';
    const content = row.chunk_content ?? '';
    const haystack = `${title} ${content}`;

    if (row.source_type === 'GOVERNMENT') {
      governmentSources += 1;
    }

    if (policyPattern.test(title)) {
      policyLikeSources += 1;
    }

    if (!cropPattern || cropPattern.test(haystack)) {
      cropAlignedSources += 1;
    }
  }

  return {
    totalSources: sourceRows.length,
    cropAlignedSources,
    governmentSources,
    policyLikeSources,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function loadPremiumProcessingInput(
  pool: Pool,
  recommendationId: string,
  userId: string
): Promise<PremiumProcessingInput | null> {
  const recommendationResult = await pool.query<ProcessingRow>(
    `
      SELECT
        r.id AS recommendation_id,
        r."userId" AS user_id,
        r.diagnosis AS recommendation_diagnosis,
        r.confidence AS recommendation_confidence,
        r."modelUsed" AS recommendation_model_used,
        i.crop AS input_crop,
        i.location AS input_location,
        i.season AS input_season,
        i."fieldAcreage" AS input_field_acreage,
        i."plannedApplicationDate" AS input_planned_application_date,
        i."fieldLatitude" AS input_field_latitude,
        i."fieldLongitude" AS input_field_longitude
      FROM "Recommendation" r
      JOIN "Input" i ON i.id = r."inputId"
      WHERE r.id = $1
        AND r."userId" = $2
      LIMIT 1
    `,
    [recommendationId, userId]
  );

  const recommendation = recommendationResult.rows[0];
  if (!recommendation) {
    return null;
  }

  const diagnosisSummary = extractDiagnosisSummary(recommendation.recommendation_diagnosis);
  const productResult = await pool.query<ProductRow>(
    `
      SELECT
        pr."productId" AS product_id,
        p.name AS product_name,
        p.type::text AS product_type,
        COALESCE(pr."applicationRate", p."applicationRate") AS application_rate,
        pr.reason
      FROM "ProductRecommendation" pr
      JOIN "Product" p ON p.id = pr."productId"
      WHERE pr."recommendationId" = $1
      ORDER BY pr.priority ASC, pr."createdAt" ASC
    `,
    [recommendationId]
  );
  let productRows = productResult.rows;

  if (productRows.length === 0) {
    const preferredTypes = inferFallbackProductTypes(diagnosisSummary.conditionType);
    const fallbackProducts = await pool.query<FallbackProductRow>(
      `
        SELECT
          id AS product_id,
          name AS product_name,
          type::text AS product_type,
          "applicationRate" AS application_rate
        FROM "Product"
        WHERE (
          CARDINALITY($2::text[]) = 0
          OR type::text = ANY($2::text[])
        )
          AND (
            $1::text IS NULL
            OR EXISTS (
              SELECT 1
              FROM unnest(crops) AS crop_name
              WHERE lower(crop_name) = lower($1)
            )
            OR COALESCE(cardinality(crops), 0) = 0
          )
        ORDER BY
          CASE
            WHEN $1::text IS NULL THEN 0
            WHEN EXISTS (
              SELECT 1
              FROM unnest(crops) AS crop_name
              WHERE lower(crop_name) = lower($1)
            ) THEN 0
            WHEN COALESCE(cardinality(crops), 0) = 0 THEN 1
            ELSE 2
          END,
          "updatedAt" DESC
        LIMIT 3
      `,
      [recommendation.input_crop, preferredTypes]
    );

    productRows = fallbackProducts.rows.map((row) => ({
      ...row,
      reason: `Category-level fallback for ${diagnosisSummary.conditionType ?? 'field'} diagnosis context.`,
    }));
  }

  const sourceResult = await pool.query<SourceSignalRow>(
    `
      SELECT
        s."sourceType"::text AS source_type,
        s.title AS source_title,
        tc.content AS chunk_content
      FROM "RecommendationSource" rs
      LEFT JOIN "TextChunk" tc ON tc.id = rs."textChunkId"
      LEFT JOIN "Source" s ON s.id = tc."sourceId"
      WHERE rs."recommendationId" = $1
      ORDER BY rs.id ASC
      LIMIT 8
    `,
    [recommendationId]
  );

  const sourceSignals = computeSourceSignals(sourceResult.rows, recommendation.input_crop);

  return {
    recommendationId,
    userId,
    recommendation: {
      modelUsed: recommendation.recommendation_model_used,
      confidence: recommendation.recommendation_confidence,
      diagnosisCondition: diagnosisSummary.condition,
      diagnosisConditionType: diagnosisSummary.conditionType,
      sourceSignals,
    },
    input: {
      crop: recommendation.input_crop,
      location: recommendation.input_location,
      season: recommendation.input_season,
      fieldAcreage: recommendation.input_field_acreage,
      plannedApplicationDate: recommendation.input_planned_application_date
        ? recommendation.input_planned_application_date.toISOString().slice(0, 10)
        : null,
      fieldLatitude: recommendation.input_field_latitude,
      fieldLongitude: recommendation.input_field_longitude,
    },
    products: productRows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      productType: row.product_type,
      applicationRate: row.application_rate,
      reason: row.reason,
    })),
  };
}

function extractRetailPrice(pricing: unknown): number | null {
  return extractRetailPriceWithSource(pricing).price;
}

function extractRetailPriceWithSource(pricing: unknown): {
  price: number | null;
  source: 'live' | 'estimated' | null;
} {
  if (!Array.isArray(pricing)) {
    return { price: null, source: null };
  }

  const first = pricing.find(
    (entry): entry is { price?: unknown; retailer?: unknown } =>
      Boolean(entry) && typeof entry === 'object' && 'price' in entry
  );

  if (!first) {
    return { price: null, source: null };
  }

  const value = Number(first.price);
  if (!Number.isFinite(value)) {
    return { price: null, source: null };
  }

  const isEstimated =
    typeof first.retailer === 'string' &&
    first.retailer.toLowerCase().includes('estimated');

  return { price: value, source: isEstimated ? 'estimated' : 'live' };
}

const PRICING_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_PRICING_REGION = 'United States';

function safeRegion(region: string): string {
  const trimmed = region.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_PRICING_REGION;
}

function estimateRetailPriceUsd(productType: string, productName: string): number {
  const type = productType.trim().toUpperCase();
  const byType: Record<string, number> = {
    FUNGICIDE: 95,
    INSECTICIDE: 85,
    HERBICIDE: 80,
    BIOLOGICAL: 70,
    FERTILIZER: 18,
    AMENDMENT: 14,
    SEED_TREATMENT: 55,
    OTHER: 30,
  };
  const base = byType[type] ?? 40;

  // Lightly scale benchmark for large pack-size hints in product names.
  const lowered = productName.toLowerCase();
  if (/(2\.5|2 1\/2|5)\s*(gal|gallon)/.test(lowered)) {
    return Math.round(base * 2.2 * 100) / 100;
  }
  if (/(50)\s*(lb|pound|bag)/.test(lowered)) {
    return Math.round(base * 1.5 * 100) / 100;
  }

  return base;
}

async function upsertPricingCacheEntry(
  pool: Pool,
  productId: string,
  regionKey: string,
  offers: PricingOffer[]
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PRICING_CACHE_TTL_MS);
  await pool.query(
    `
      INSERT INTO "ProductPricingCache" (
        id,
        "productId",
        region,
        pricing,
        "cachedAt",
        "expiresAt"
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6)
      ON CONFLICT ("productId", region) DO UPDATE
        SET
          pricing = EXCLUDED.pricing,
          "cachedAt" = EXCLUDED."cachedAt",
          "expiresAt" = EXCLUDED."expiresAt"
    `,
    [randomUUID(), productId, regionKey, JSON.stringify(offers), now, expiresAt]
  );
}

async function hydrateMissingPricingFromCacheRegion(
  pool: Pool,
  map: Map<string, number | null>,
  sourceMap: Map<string, 'live' | 'estimated' | null>,
  productIds: string[],
  regionKey: string
): Promise<void> {
  const missingProductIds = productIds.filter((productId) => !map.has(productId));
  if (missingProductIds.length === 0) {
    return;
  }

  const result = await pool.query<PricingCacheRow>(
    `
      SELECT
        "productId" AS product_id,
        pricing
      FROM "ProductPricingCache"
      WHERE "productId" = ANY($1::text[])
        AND region = $2
        AND "expiresAt" > NOW()
    `,
    [missingProductIds, regionKey]
  );

  for (const row of result.rows) {
    const { price, source } = extractRetailPriceWithSource(row.pricing);
    map.set(row.product_id, price);
    sourceMap.set(row.product_id, source);
  }
}

export async function loadCachedRetailPricing(
  pool: Pool,
  productIds: string[],
  region: string
): Promise<Array<{ productId: string; retailPriceUsd: number | null; priceSource: 'live' | 'estimated' | null }>> {
  if (productIds.length === 0) {
    return [];
  }

  const resolvedRegion = safeRegion(region);
  const regionKey = normalizeRegionKey(resolvedRegion);
  const pricingMode = (process.env.PREMIUM_PRICING_LOOKUP_MODE ?? 'live_then_estimated')
    .trim()
    .toLowerCase();
  const liveLookupEnabled = pricingMode !== 'estimated_only';
  const map = new Map<string, number | null>();
  const sourceMap = new Map<string, 'live' | 'estimated' | null>();

  await hydrateMissingPricingFromCacheRegion(pool, map, sourceMap, productIds, regionKey);

  if (map.size < productIds.length && regionKey !== normalizeRegionKey(DEFAULT_PRICING_REGION)) {
    await hydrateMissingPricingFromCacheRegion(
      pool,
      map,
      sourceMap,
      productIds,
      normalizeRegionKey(DEFAULT_PRICING_REGION)
    );
  }

  const missingProductIds = productIds.filter((productId) => !map.has(productId));
  if (missingProductIds.length > 0) {
    const productResult = await pool.query<PricingProductRow>(
      `
        SELECT
          id AS product_id,
          name AS product_name,
          brand AS product_brand,
          type::text AS product_type
        FROM "Product"
        WHERE id = ANY($1::text[])
      `,
      [missingProductIds]
    );

    for (const product of productResult.rows) {
      try {
        const offers = liveLookupEnabled
          ? await searchLivePricing({
              productName: product.product_name,
              brand: product.product_brand,
              region: resolvedRegion,
              maxResults: 5,
            })
          : [];
        if (offers.length === 0) {
          const estimatedPrice = estimateRetailPriceUsd(
            product.product_type,
            product.product_name
          );
          const estimatedOffers: PricingOffer[] = [
            {
              price: estimatedPrice,
              unit: 'estimated unit',
              retailer: 'Estimated benchmark',
              url: null,
              region: resolvedRegion,
              lastUpdated: new Date().toISOString(),
            },
          ];
          await upsertPricingCacheEntry(pool, product.product_id, regionKey, estimatedOffers);
          map.set(product.product_id, estimatedPrice);
          sourceMap.set(product.product_id, 'estimated');
          continue;
        }

        await upsertPricingCacheEntry(pool, product.product_id, regionKey, offers);
        map.set(product.product_id, extractRetailPrice(offers));
        sourceMap.set(product.product_id, 'live');
      } catch (error) {
        console.warn('[PremiumPricing] Live pricing lookup failed', {
          productId: product.product_id,
          region: resolvedRegion,
          error: (error as Error).message,
        });
        map.set(product.product_id, null);
        sourceMap.set(product.product_id, null);
      }
    }
  }

  return productIds.map((productId) => ({
    productId,
    retailPriceUsd: map.get(productId) ?? null,
    priceSource: sourceMap.get(productId) ?? null,
  }));
}

export async function upsertPremiumInsight(
  pool: Pool,
  userId: string,
  recommendationId: string,
  payload: PremiumInsightPayload
): Promise<void> {
  const storedDecision = toPersistedDecision(payload.riskReview ?? payload.complianceDecision ?? null);

  await pool.query(
    `
      INSERT INTO "RecommendationPremiumInsight" (
        "recommendationId",
        "userId",
        status,
        "complianceDecision",
        checks,
        "costAnalysis",
        "sprayWindows",
        report,
        "failureReason",
        "createdAt",
        "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, NOW(), NOW())
      ON CONFLICT ("recommendationId") DO UPDATE
        SET
          status = EXCLUDED.status,
          "complianceDecision" = EXCLUDED."complianceDecision",
          checks = EXCLUDED.checks,
          "costAnalysis" = EXCLUDED."costAnalysis",
          "sprayWindows" = EXCLUDED."sprayWindows",
          report = EXCLUDED.report,
          "failureReason" = EXCLUDED."failureReason",
          "updatedAt" = NOW()
    `,
    [
      recommendationId,
      userId,
      payload.status,
      storedDecision,
      JSON.stringify(payload.checks),
      payload.costAnalysis ? JSON.stringify(payload.costAnalysis) : null,
      JSON.stringify(payload.sprayWindows),
      payload.report ? JSON.stringify(payload.report) : null,
      payload.failureReason ?? null,
    ]
  );
}

export async function persistComplianceAudit(
  pool: Pool,
  recommendationId: string,
  userId: string,
  compliance: ComplianceEvaluationResult,
  inputSnapshot: PremiumProcessingInput['input']
): Promise<void> {
  await pool.query(
    `
      DELETE FROM "ComplianceAuditLog"
      WHERE "recommendationId" = $1
    `,
    [recommendationId]
  );

  for (const check of compliance.checks) {
    await pool.query(
      `
        INSERT INTO "ComplianceAuditLog" (
          "recommendationId",
          "userId",
          "checkId",
          "ruleVersion",
          "sourceVersion",
          "inputSnapshot",
          result,
          message,
          evidence,
          "createdAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, NOW())
      `,
      [
        recommendationId,
        userId,
        check.id,
        check.ruleVersion,
        check.sourceVersion ?? null,
        JSON.stringify(inputSnapshot),
        check.result,
        check.message,
        JSON.stringify(check.evidence ?? {}),
      ]
    );
  }
}

function parseJsonArray<T>(value: unknown, fallback: T[]): T[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value as T[];
}

function parseJsonObject<T>(value: unknown): T | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as T;
}

function normalizeChecks(value: unknown): PremiumInsightPayload['checks'] {
  if (!Array.isArray(value)) {
    return [];
  }

  const checks: PremiumInsightPayload['checks'] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      continue;
    }

    const record = raw as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const title = typeof record.title === 'string' ? record.title : '';
    const message = typeof record.message === 'string' ? record.message : '';
    const result = normalizeRiskReviewDecision(
      typeof record.result === 'string' ? record.result : null
    );

    if (!id || !title || !message || !result) {
      continue;
    }

    checks.push({
      id,
      title,
      result,
      severity: record.severity === 'hard' ? 'hard' : 'soft',
      message,
      ruleVersion:
        typeof record.ruleVersion === 'string' && record.ruleVersion.trim().length > 0
          ? record.ruleVersion
          : 'unknown',
      sourceVersion:
        typeof record.sourceVersion === 'string' ? record.sourceVersion : undefined,
      evidence:
        record.evidence && typeof record.evidence === 'object' && !Array.isArray(record.evidence)
          ? (record.evidence as Record<string, unknown>)
          : undefined,
    });
  }

  return checks;
}

export async function getPremiumInsight(
  pool: Pool,
  recommendationId: string,
  userId: string
): Promise<PremiumInsightPayload | null> {
  const result = await pool.query<PremiumInsightRow>(
    `
      SELECT
        status,
        "complianceDecision" AS compliance_decision,
        checks,
        "costAnalysis" AS cost_analysis,
        "sprayWindows" AS spray_windows,
        report,
        "failureReason" AS failure_reason,
        "updatedAt" AS updated_at
      FROM "RecommendationPremiumInsight"
      WHERE "recommendationId" = $1
        AND "userId" = $2
      LIMIT 1
    `,
    [recommendationId, userId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    status: row.status,
    riskReview: normalizeRiskReviewDecision(row.compliance_decision),
    complianceDecision: normalizeRiskReviewDecision(row.compliance_decision),
    checks: normalizeChecks(row.checks),
    costAnalysis: parseJsonObject<CostAnalysisResult>(row.cost_analysis),
    sprayWindows: parseJsonArray(row.spray_windows, []),
    advisoryNotice: defaultAdvisoryNotice,
    report: parseJsonObject(row.report),
    failureReason: row.failure_reason ?? undefined,
  };
}
