import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { RecommendationResult } from '@crop-copilot/contracts';
import { runRecommendationPipeline } from '../pipeline/recommendation-pipeline';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

interface BaseRecommendationRow {
  recommendation_id: string;
  user_id: string;
  input_id: string;
  model_used: string;
  confidence: number;
  diagnosis: unknown;
  created_at: Date;
  crop: string | null;
  location: string | null;
  season: string | null;
  description: string | null;
}

interface SourceEvidenceRow {
  chunk_id: string | null;
  relevance: number | null;
  excerpt: string | null;
  source_title: string | null;
  source_type: string | null;
}

interface SourceEvidence {
  chunkId: string;
  relevance: number;
  excerpt: string;
  sourceTitle: string;
  sourceType: string;
}

interface NormalizedAction {
  action: string;
  priority: string;
  timing: string;
  details: string;
  citations: string[];
}

interface NormalizedProduct {
  productId: string;
  reason: string;
  applicationRate: string;
}

interface NormalizedRecommendationPayload {
  diagnosisCondition: string;
  diagnosisType: string;
  diagnosisReasoning: string;
  confidence: number;
  actions: NormalizedAction[];
  products: NormalizedProduct[];
}

interface QualityScores {
  diagnosis: number;
  confidence: number;
  actionability: number;
  citations: number;
  cropAlignment: number;
  products: number;
  overall: number;
}

interface RecommendationAudit {
  recommendationId: string;
  inputId: string;
  crop: string | null;
  location: string | null;
  variant: string;
  modelUsed: string;
  scores: QualityScores;
  issues: string[];
  feedback: string[];
  actionCount: number;
  productCount: number;
  citationCoverage: number;
  sourceCount: number;
}

interface ModelVariant {
  id: string;
  providers: string;
  modelEnvKey: string;
  modelName: string;
}

interface RunSummary {
  variant: string;
  modelUsed: string;
  averageOverall: number;
  averageCitationCoverage: number;
  averageActionCount: number;
  averageProductCount: number;
  count: number;
}

function parseNumberArg(flag: string, fallback: number): number {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function parseStringArg(flag: string): string | null {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index < 0) return null;
  const value = process.argv[index + 1]?.trim();
  return value && value.length > 0 ? value : null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizePayload(payload: unknown): NormalizedRecommendationPayload {
  const root = asObject(payload);
  const diagnosis = asObject(root.diagnosis);
  const confidence = clamp(
    asNumber(diagnosis.confidence ?? root.confidence, 0.5),
    0,
    1
  );
  const actions = asArray(root.recommendations).map((entry) => {
    const item = asObject(entry);
    return {
      action: asString(item.action),
      priority: asString(item.priority),
      timing: asString(item.timing),
      details: asString(item.details),
      citations: asArray(item.citations)
        .map((citation) => asString(citation))
        .filter((citation) => citation.length > 0),
    };
  });
  const products = asArray(root.products).map((entry) => {
    const item = asObject(entry);
    return {
      productId: asString(item.productId),
      reason: asString(item.reason),
      applicationRate: asString(item.applicationRate),
    };
  });

  return {
    diagnosisCondition: asString(diagnosis.condition),
    diagnosisType: asString(diagnosis.conditionType).toLowerCase() || 'unknown',
    diagnosisReasoning: asString(diagnosis.reasoning),
    confidence,
    actions: actions.filter((action) => action.action.length > 0),
    products: products.filter(
      (product) => product.productId.length > 0 || product.reason.length > 0
    ),
  };
}

function buildCropAliases(crop: string | null): Set<string> {
  const aliases = new Set<string>();
  const normalized = asString(crop).toLowerCase();
  if (!normalized) return aliases;

  aliases.add(normalized);
  if (normalized.endsWith('s')) {
    aliases.add(normalized.slice(0, -1));
  } else {
    aliases.add(`${normalized}s`);
  }

  if (normalized === 'corn') aliases.add('maize');
  if (normalized === 'soybeans' || normalized === 'soybean') {
    aliases.add('soybeans');
    aliases.add('soybean');
    aliases.add('soya');
  }

  return aliases;
}

const OTHER_CROP_TERMS = [
  'alfalfa',
  'almond',
  'apple',
  'barley',
  'blueberry',
  'broccoli',
  'canola',
  'carrot',
  'corn',
  'cotton',
  'cucumber',
  'grape',
  'lettuce',
  'millet',
  'onion',
  'peach',
  'peanut',
  'pepper',
  'potato',
  'rice',
  'rye',
  'sorghum',
  'soybean',
  'strawberry',
  'sugarcane',
  'sunflower',
  'tomato',
  'tobacco',
];

function includesAny(text: string, terms: Iterable<string>): boolean {
  for (const term of terms) {
    if (!term) continue;
    if (text.includes(term)) return true;
  }
  return false;
}

function evaluateQuality(params: {
  recommendationId: string;
  inputId: string;
  crop: string | null;
  location: string | null;
  variant: string;
  modelUsed: string;
  payload: NormalizedRecommendationPayload;
  sources: SourceEvidence[];
}): RecommendationAudit {
  const { payload } = params;
  const issues: string[] = [];
  const feedback: string[] = [];
  const actionCount = payload.actions.length;
  const productCount = payload.products.length;
  const sourceChunkIds = new Set(params.sources.map((source) => source.chunkId));
  const validCitationCount = payload.actions.filter((action) =>
    action.citations.some((citation) => sourceChunkIds.has(citation))
  ).length;
  const citationCoverage = actionCount > 0 ? validCitationCount / actionCount : 0;

  let diagnosisScore = 18;
  if (payload.diagnosisType === 'unknown' || /unknown|undetermined/i.test(payload.diagnosisCondition)) {
    diagnosisScore = 8;
    issues.push('Diagnosis is mostly uncertain/unknown.');
    feedback.push(
      'Force top-2 differential diagnoses with explicit disambiguation signals before returning unknown.'
    );
  }
  if (payload.diagnosisReasoning.length < 100) {
    diagnosisScore -= 4;
    issues.push('Diagnostic reasoning is too short.');
    feedback.push('Require reasoning to include symptom evidence + ruling out alternatives.');
  }
  diagnosisScore = clamp(diagnosisScore, 0, 20);

  let confidenceScore = 12;
  if (payload.confidence < 0.55) {
    confidenceScore = 4;
    issues.push('Confidence is very low.');
    feedback.push('Only return low confidence when citing missing evidence and requested next tests.');
  } else if (payload.confidence < 0.65) {
    confidenceScore = 8;
  } else if (payload.confidence > 0.95) {
    confidenceScore = 9;
  }
  confidenceScore = clamp(confidenceScore, 0, 15);

  let actionabilityScore = 0;
  actionabilityScore += Math.min(10, (actionCount / 3) * 10);
  const detailedActions =
    actionCount > 0
      ? payload.actions.filter((action) => action.details.length >= 110).length / actionCount
      : 0;
  actionabilityScore += detailedActions * 6;
  const timedActions =
    actionCount > 0
      ? payload.actions.filter((action) => action.timing.length >= 8).length / actionCount
      : 0;
  actionabilityScore += timedActions * 4;
  if (actionCount < 3) {
    issues.push('Fewer than 3 staged actions.');
    feedback.push('Return 3 actions: immediate validation, near-term treatment, follow-up monitoring.');
  }
  if (detailedActions < 0.7) {
    issues.push('Action details are generic.');
    feedback.push('Add concrete thresholds, measurements, or field checks in action details.');
  }
  actionabilityScore = clamp(actionabilityScore, 0, 20);

  let citationScore = citationCoverage * 14;
  const averageRelevance =
    params.sources.length > 0
      ? params.sources.reduce((sum, source) => sum + source.relevance, 0) / params.sources.length
      : 0;
  citationScore += clamp(averageRelevance * 6, 0, 6);
  if (citationCoverage < 0.8) {
    issues.push('Citation coverage is weak.');
    feedback.push('Every action must cite at least one retrieved chunkId present in output sources.');
  }
  citationScore = clamp(citationScore, 0, 20);

  const cropAliases = buildCropAliases(params.crop);
  const targetMentions = params.sources.filter((source) =>
    includesAny(`${source.sourceTitle} ${source.excerpt}`.toLowerCase(), cropAliases)
  ).length;
  const nonTargetMentions = params.sources.filter((source) => {
    const combined = `${source.sourceTitle} ${source.excerpt}`.toLowerCase();
    if (includesAny(combined, cropAliases)) return false;
    return includesAny(combined, OTHER_CROP_TERMS);
  }).length;
  const cropAlignmentRatio =
    params.sources.length > 0 ? targetMentions / params.sources.length : 0;

  let cropAlignmentScore = clamp(cropAlignmentRatio * 15, 0, 15);
  if (nonTargetMentions > targetMentions && params.sources.length > 0) {
    cropAlignmentScore = clamp(cropAlignmentScore - 4, 0, 15);
    issues.push('Sources appear cross-crop/misaligned.');
    feedback.push('Increase crop-specific retrieval filtering before generation.');
  }
  if (cropAlignmentRatio < 0.5 && params.crop) {
    issues.push('Less than half of sources explicitly mention target crop.');
    feedback.push('Require at least 2 crop-matching sources before final recommendation.');
  }

  const productsWithRate = payload.products.filter(
    (product) => product.applicationRate.length > 0
  ).length;
  let productScore = Math.min(6, (productCount / 3) * 6);
  if (productCount > 0) {
    productScore += (productsWithRate / productCount) * 4;
  }
  if (productCount > 0 && productsWithRate / Math.max(productCount, 1) < 0.7) {
    issues.push('Product entries missing usable application rates.');
    feedback.push('Require normalized applicationRate for each product or omit product suggestion.');
  }
  productScore = clamp(productScore, 0, 10);

  const overall = clamp(
    Math.round(
      diagnosisScore +
        confidenceScore +
        actionabilityScore +
        citationScore +
        cropAlignmentScore +
        productScore
    ),
    0,
    100
  );

  return {
    recommendationId: params.recommendationId,
    inputId: params.inputId,
    crop: params.crop,
    location: params.location,
    variant: params.variant,
    modelUsed: params.modelUsed,
    scores: {
      diagnosis: diagnosisScore,
      confidence: confidenceScore,
      actionability: Math.round(actionabilityScore),
      citations: Math.round(citationScore),
      cropAlignment: Math.round(cropAlignmentScore),
      products: Math.round(productScore),
      overall,
    },
    issues,
    feedback,
    actionCount,
    productCount,
    citationCoverage: Number(citationCoverage.toFixed(3)),
    sourceCount: params.sources.length,
  };
}

async function loadStoredSources(pool: Pool, recommendationId: string): Promise<SourceEvidence[]> {
  const result = await pool.query<SourceEvidenceRow>(
    `
      SELECT
        rs."textChunkId" AS chunk_id,
        COALESCE(rs."relevanceScore", 0) AS relevance,
        LEFT(COALESCE(tc.content, ''), 300) AS excerpt,
        COALESCE(s.title, '') AS source_title,
        COALESCE(s."sourceType"::text, 'UNKNOWN') AS source_type
      FROM "RecommendationSource" rs
      LEFT JOIN "TextChunk" tc ON tc.id = rs."textChunkId"
      LEFT JOIN "Source" s ON s.id = tc."sourceId"
      WHERE rs."recommendationId" = $1
    `,
    [recommendationId]
  );

  return result.rows
    .filter((row) => row.chunk_id)
    .map((row) => ({
      chunkId: row.chunk_id as string,
      relevance: clamp(asNumber(row.relevance), 0, 1),
      excerpt: asString(row.excerpt),
      sourceTitle: asString(row.source_title),
      sourceType: asString(row.source_type),
    }));
}

async function loadSourceMetadataForChunkIds(
  pool: Pool,
  chunkIds: string[]
): Promise<Map<string, SourceEvidence>> {
  if (chunkIds.length === 0) return new Map();
  const result = await pool.query<SourceEvidenceRow>(
    `
      SELECT
        tc.id AS chunk_id,
        0.5::double precision AS relevance,
        LEFT(COALESCE(tc.content, ''), 300) AS excerpt,
        COALESCE(s.title, '') AS source_title,
        COALESCE(s."sourceType"::text, 'UNKNOWN') AS source_type
      FROM "TextChunk" tc
      LEFT JOIN "Source" s ON s.id = tc."sourceId"
      WHERE tc.id = ANY($1::text[])
    `,
    [chunkIds]
  );

  const out = new Map<string, SourceEvidence>();
  for (const row of result.rows) {
    if (!row.chunk_id) continue;
    out.set(row.chunk_id, {
      chunkId: row.chunk_id,
      relevance: clamp(asNumber(row.relevance, 0.5), 0, 1),
      excerpt: asString(row.excerpt),
      sourceTitle: asString(row.source_title),
      sourceType: asString(row.source_type),
    });
  }
  return out;
}

async function withTemporaryEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T>
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (typeof value === 'string') {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
}

async function runVariantForInput(
  pool: Pool,
  row: BaseRecommendationRow,
  variant: ModelVariant
): Promise<RecommendationAudit | null> {
  try {
    const result = await withTemporaryEnv(
      {
        RECOMMENDATION_MODEL_PROVIDERS: variant.providers,
        [variant.modelEnvKey]: variant.modelName,
        REQUIRE_MODEL_OUTPUT: 'true',
        DISABLE_RETRIEVAL_AUDIT: '1',
      },
      async () =>
        runRecommendationPipeline({
          inputId: row.input_id,
          userId: row.user_id,
          jobId: randomUUID(),
        })
    );

    const payload = normalizePayload(result.diagnosis);
    const chunkIds = result.sources.map((source) => source.chunkId);
    const sourceMap = await loadSourceMetadataForChunkIds(pool, chunkIds);
    const sources = result.sources.map((source) => {
      const metadata = sourceMap.get(source.chunkId);
      return {
        chunkId: source.chunkId,
        relevance: clamp(asNumber(source.relevance), 0, 1),
        excerpt: asString(source.excerpt) || metadata?.excerpt || '',
        sourceTitle: metadata?.sourceTitle || '',
        sourceType: metadata?.sourceType || 'UNKNOWN',
      };
    });

    return evaluateQuality({
      recommendationId: row.recommendation_id,
      inputId: row.input_id,
      crop: row.crop,
      location: row.location,
      variant: variant.id,
      modelUsed: result.modelUsed,
      payload,
      sources,
    });
  } catch (error) {
    console.error('[AuditQuality] Variant run failed', {
      recommendationId: row.recommendation_id,
      inputId: row.input_id,
      variant: variant.id,
      error: (error as Error).message,
    });
    return null;
  }
}

function summarize(records: RecommendationAudit[]): RunSummary[] {
  const groups = new Map<string, RecommendationAudit[]>();
  for (const record of records) {
    const key = `${record.variant}::${record.modelUsed}`;
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }

  const summaries: RunSummary[] = [];
  for (const [key, group] of groups.entries()) {
    const [variant, modelUsed] = key.split('::');
    const count = group.length;
    const average = (selector: (record: RecommendationAudit) => number): number =>
      Number((group.reduce((sum, record) => sum + selector(record), 0) / Math.max(count, 1)).toFixed(3));
    summaries.push({
      variant,
      modelUsed,
      averageOverall: average((record) => record.scores.overall),
      averageCitationCoverage: average((record) => record.citationCoverage),
      averageActionCount: average((record) => record.actionCount),
      averageProductCount: average((record) => record.productCount),
      count,
    });
  }

  return summaries.sort((a, b) => b.averageOverall - a.averageOverall);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const limit = parseNumberArg('--limit', 200);
  const includeStored = !hasFlag('--skip-stored');
  const modelVariantsArg = parseStringArg('--model-variants');
  const outputPathArg = parseStringArg('--output');
  const includeCreatedAfter = parseStringArg('--created-after');
  const includeCreatedBefore = parseStringArg('--created-before');

  const modelVariants: ModelVariant[] = (modelVariantsArg ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [id, providers, modelEnvKey, ...modelParts] = entry.split(':');
      return {
        id,
        providers,
        modelEnvKey,
        modelName: modelParts.join(':'),
      };
    })
    .filter(
      (variant) =>
        variant.id &&
        variant.providers &&
        variant.modelEnvKey &&
        variant.modelName
    );

  const pool = new Pool({
    connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
    ssl: resolvePoolSslConfig(),
    max: Number(process.env.PG_POOL_MAX ?? 4),
  });

  const whereClauses: string[] = [];
  const values: Array<string | number> = [];
  if (includeCreatedAfter) {
    values.push(includeCreatedAfter);
    whereClauses.push(`r."createdAt" >= $${values.length}::timestamptz`);
  }
  if (includeCreatedBefore) {
    values.push(includeCreatedBefore);
    whereClauses.push(`r."createdAt" <= $${values.length}::timestamptz`);
  }
  values.push(limit);
  const limitIndex = values.length;

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  try {
    const result = await pool.query<BaseRecommendationRow>(
      `
        SELECT
          r.id AS recommendation_id,
          r."userId" AS user_id,
          r."inputId" AS input_id,
          r."modelUsed" AS model_used,
          r.confidence,
          r.diagnosis,
          r."createdAt" AS created_at,
          i.crop,
          i.location,
          i.season,
          i.description
        FROM "Recommendation" r
        JOIN "Input" i ON i.id = r."inputId"
        ${whereSql}
        ORDER BY r."createdAt" DESC
        LIMIT $${limitIndex}
      `,
      values
    );

    const audits: RecommendationAudit[] = [];
    for (const row of result.rows) {
      if (includeStored) {
        const storedPayload = normalizePayload(row.diagnosis);
        const storedSources = await loadStoredSources(pool, row.recommendation_id);
        audits.push(
          evaluateQuality({
            recommendationId: row.recommendation_id,
            inputId: row.input_id,
            crop: row.crop,
            location: row.location,
            variant: 'stored',
            modelUsed: row.model_used,
            payload: storedPayload,
            sources: storedSources,
          })
        );
      }

      for (const variant of modelVariants) {
        const audit = await runVariantForInput(pool, row, variant);
        if (audit) audits.push(audit);
      }
    }

    const summaries = summarize(audits);
    const byRecommendation = new Map<string, RecommendationAudit[]>();
    for (const record of audits) {
      const key = `${record.recommendationId}:${record.inputId}`;
      const group = byRecommendation.get(key);
      if (group) group.push(record);
      else byRecommendation.set(key, [record]);
    }

    const comparisons = [...byRecommendation.values()].map((group) => {
      const ordered = [...group].sort((a, b) => b.scores.overall - a.scores.overall);
      return {
        recommendationId: ordered[0]?.recommendationId ?? '',
        inputId: ordered[0]?.inputId ?? '',
        crop: ordered[0]?.crop ?? null,
        bestVariant: ordered[0]?.variant ?? null,
        bestScore: ordered[0]?.scores.overall ?? null,
        variants: ordered.map((record) => ({
          variant: record.variant,
          modelUsed: record.modelUsed,
          overall: record.scores.overall,
          issues: record.issues,
          feedback: record.feedback,
        })),
      };
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath =
      outputPathArg ??
      resolve(process.cwd(), 'reports', `recommendation-quality-audit-${timestamp}.json`);
    mkdirSync(resolve(outputPath, '..'), { recursive: true });

    const report = {
      generatedAt: new Date().toISOString(),
      totalAudits: audits.length,
      recommendationCount: result.rows.length,
      modelVariantCount: modelVariants.length,
      summaries,
      comparisons,
      records: audits,
    };
    writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(
      JSON.stringify(
        {
          outputPath,
          recommendationCount: result.rows.length,
          totalAudits: audits.length,
          summaries,
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[AuditQuality] fatal', { error: (error as Error).message });
  process.exitCode = 1;
});

