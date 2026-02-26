import type { Pool } from 'pg';
import type {
  CostAnalysisResult,
  PremiumInsightPayload,
  PremiumProcessingInput,
  PremiumStatus,
  RiskReviewDecision,
} from './types';
import { DEFAULT_ADVISORY_NOTICE as defaultAdvisoryNotice } from './types';
import type { ComplianceEvaluationResult } from './compliance-engine';

interface ProcessingRow {
  recommendation_id: string;
  user_id: string;
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

interface PricingCacheRow {
  product_id: string;
  pricing: unknown;
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

  return {
    recommendationId,
    userId,
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
    products: productResult.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      productType: row.product_type,
      applicationRate: row.application_rate,
      reason: row.reason,
    })),
  };
}

function extractRetailPrice(pricing: unknown): number | null {
  if (!Array.isArray(pricing)) {
    return null;
  }

  const first = pricing.find(
    (entry): entry is { price?: unknown } =>
      Boolean(entry) && typeof entry === 'object' && 'price' in entry
  );

  if (!first) {
    return null;
  }

  const value = Number(first.price);
  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

export async function loadCachedRetailPricing(
  pool: Pool,
  productIds: string[],
  region: string
): Promise<Array<{ productId: string; retailPriceUsd: number | null }>> {
  if (productIds.length === 0) {
    return [];
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
    [productIds, normalizeRegionKey(region)]
  );

  const map = new Map<string, number | null>();
  for (const row of result.rows) {
    map.set(row.product_id, extractRetailPrice(row.pricing));
  }

  return productIds.map((productId) => ({
    productId,
    retailPriceUsd: map.get(productId) ?? null,
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
