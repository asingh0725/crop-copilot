import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { CreateInputCommand, RecommendationResult } from '@crop-copilot/contracts';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { rankCandidates } from '../rag/hybrid-ranker';
import { rerank } from '../ml/reranker';
import { applyMMR } from '../rag/mmr';
import { generateHypotheticalPassage } from '../rag/hyde';
import { expandRetrievalQuery, type QueryExpansionResult } from '../rag/query-expansion';
import type { RankedCandidate, RetrievedCandidate, SourceAuthorityType } from '../rag/types';
import { CROPS } from '../ingestion/discovery-seeds';

export interface RecommendationPipelineInput {
  inputId: string;
  userId: string;
  jobId: string;
}

interface InputSnapshot {
  type: CreateInputCommand['type'];
  imageUrl?: string;
  description?: string;
  labData?: Record<string, unknown>;
  location?: string;
  crop?: string;
  season?: string;
}

interface CandidateRow {
  chunk_id: string;
  content: string;
  metadata: unknown;
  source_id: string;
  source_title: string;
  source_type: string;
  institution: string | null;
  similarity: number;
  hybrid_score?: number;
  source_boost?: number;
}

interface OutputDiagnosis {
  condition: string;
  conditionType: string;
  confidence: number;
  reasoning: string;
}

interface OutputRecommendation {
  action: string;
  priority: string;
  timing?: string;
  details: string;
  citations: string[];
}

interface OutputProduct {
  productId: string;
  reason: string;
  applicationRate?: string;
  alternatives?: string[];
}

interface ModelOutput {
  diagnosis?: Partial<OutputDiagnosis>;
  recommendations?: Array<Partial<OutputRecommendation>>;
  products?: Array<Partial<OutputProduct>>;
  confidence?: number;
}

interface ModelGenerationResult {
  model: string;
  output: ModelOutput;
}

interface ModelGenerationInput {
  input: InputSnapshot;
  candidates: RankedCandidate[];
  queryExpansion: QueryExpansionResult;
}

interface ModelGenerationOptions {
  promptOverride?: string;
}

interface QualityAssessment {
  score: number;
  needsRegeneration: boolean;
  needsRepair: boolean;
  reasons: string[];
  diagnosisType: OutputDiagnosis['conditionType'];
  confidence: number;
  recommendationCount: number;
  citationCoverage: number;
  cropCitationCoverage: number;
  weakEvidence: boolean;
}

export interface RecommendationPipelineDependencies {
  loadInputSnapshot?: (
    inputId: string,
    userId: string
  ) => Promise<InputSnapshot | null>;
  retrieveCandidates?: (
    input: InputSnapshot,
    expansion: QueryExpansionResult
  ) => Promise<RetrievedCandidate[]>;
  generateModelOutput?: (
    params: ModelGenerationInput
  ) => Promise<ModelGenerationResult | null>;
  now?: () => Date;
}

const DEFAULT_RETRIEVAL_LIMIT = 18;
const MAX_CONTEXT_CANDIDATES = 6;
const CONDITION_TYPES = new Set([
  'deficiency',
  'disease',
  'pest',
  'environmental',
  'unknown',
]);
const RECOMMENDATION_PRIORITIES = new Set([
  'immediate',
  'soon',
  'when_convenient',
]);
const MIN_DIAGNOSIS_RANK_SCORE = 0.33;
const MIN_REQUIRED_CONFIDENCE = 0.6;
const DEFAULT_MAX_REGENERATION_ATTEMPTS = 1;
const DEFAULT_MAX_REPAIR_ATTEMPTS = 1;
const DEFAULT_MODEL_TIMEOUT_MS = 45_000;
const DEFAULT_EMBEDDING_TIMEOUT_MS = 15_000;
const DIAGNOSIS_GENERIC_TITLE_REGEX =
  '(general knowledge|starting a commercial nursery|commercial nursery|general guide|regulation|regulations|code of|chapter|statute|administrative|study manual|rules of|pesticide act|certification)';

const CROP_ALIAS_ENTRIES: Array<{ canonical: string; alias: string }> = buildCropAliasEntries();
const CROP_ALIAS_TO_CANONICAL = new Map(
  CROP_ALIAS_ENTRIES.map((entry) => [entry.alias, entry.canonical])
);
const CROP_ALIAS_MATCHERS = CROP_ALIAS_ENTRIES.map((entry) => ({
  canonical: entry.canonical,
  matcher: new RegExp(`(^|[^a-z0-9])${escapeRegex(entry.alias)}([^a-z0-9]|$)`, 'i'),
}));

let sharedPool: Pool | null = null;

function resolvePool(): Pool {
  if (!sharedPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required when processing recommendation jobs');
    }

    sharedPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 5),
      ssl: resolvePoolSslConfig(),
    });
  }

  return sharedPool;
}

export async function runRecommendationPipeline(
  input: RecommendationPipelineInput,
  dependencies: RecommendationPipelineDependencies = {}
): Promise<RecommendationResult> {
  const now = dependencies.now ?? (() => new Date());
  const loadInputSnapshot =
    dependencies.loadInputSnapshot ?? loadInputSnapshotFromDatabase;
  const retrieveCandidates =
    dependencies.retrieveCandidates ?? retrieveCandidatesFromKnowledgeBase;
  const generateModelOutput =
    dependencies.generateModelOutput ?? generateModelOutputFromProviders;
  const usingDefaultModelGenerator = !dependencies.generateModelOutput;

  const inputSnapshot = await loadInputSnapshot(input.inputId, input.userId);
  if (!inputSnapshot) {
    throw new Error(`Input snapshot was not found for inputId=${input.inputId}`);
  }

  const retrievalQuery = buildRetrievalQueryFromInput(inputSnapshot);
  const queryExpansion = expandRetrievalQuery({
    query: retrievalQuery,
    crop: inputSnapshot.crop,
    region: inputSnapshot.location,
    growthStage: inputSnapshot.season,
  });

  // HyDE: generate a hypothetical document passage to use as the query embedding.
  // Falls back to the original query if Claude is unavailable.
  const hydePassage = await generateHypotheticalPassage({
    query: retrievalQuery,
    crop: inputSnapshot.crop,
    location: inputSnapshot.location,
    season: inputSnapshot.season,
  });
  const effectiveExpansion = hydePassage
    ? expandRetrievalQuery({ query: hydePassage, crop: inputSnapshot.crop, region: inputSnapshot.location, growthStage: inputSnapshot.season })
    : queryExpansion;

  const candidates = await retrieveCandidates(inputSnapshot, effectiveExpansion);
  const ranked = rankCandidates(candidates, {
    queryTerms: queryExpansion.terms,
    crop: inputSnapshot.crop,
    region: inputSnapshot.location,
  });

  // MMR: diversify top candidates so Claude gets varied evidence, not duplicates.
  const diversified = applyMMR(ranked, MAX_CONTEXT_CANDIDATES * 2, 0.65);

  // Rerank with learned model when SageMaker endpoint is configured;
  // falls back to MMR-diversified order on any failure.
  const reranked = await rerank(diversified, {
    crop: inputSnapshot.crop,
    queryTerms: queryExpansion.terms,
  });
  const candidatePool = reranked ?? diversified;
  const filteredCandidates = filterCandidatesForDiagnosis(candidatePool, inputSnapshot);
  const cropTerm = normalizeCropTerm(inputSnapshot.crop);
  const cropAlignedCandidates =
    cropTerm.length > 0
      ? filteredCandidates.filter((candidate) => isCropAlignedCandidate(candidate, cropTerm))
      : [];
  const scopedCandidates =
    cropAlignedCandidates.length > 0 ? cropAlignedCandidates : filteredCandidates;
  const highQualityCandidates = scopedCandidates.filter(
    (candidate) =>
      candidate.rankScore >= MIN_DIAGNOSIS_RANK_SCORE ||
      candidate.similarity >= MIN_DIAGNOSIS_RANK_SCORE
  );
  const diagnosisCandidates =
    highQualityCandidates.length >= 2 ? highQualityCandidates : scopedCandidates;
  const topCandidates = diagnosisCandidates.slice(0, MAX_CONTEXT_CANDIDATES);

  const baseline = buildNormalizationBaseline(topCandidates);
  const maxRegenerationAttempts = parsePositiveIntEnv(
    process.env.RECOMMENDATION_QUALITY_REGEN_ATTEMPTS,
    DEFAULT_MAX_REGENERATION_ATTEMPTS
  );
  const maxRepairAttempts = parsePositiveIntEnv(
    process.env.RECOMMENDATION_QUALITY_REPAIR_ATTEMPTS,
    DEFAULT_MAX_REPAIR_ATTEMPTS
  );

  let modelResult: ModelGenerationResult | null = null;
  let normalized: {
    diagnosis: OutputDiagnosis;
    recommendations: OutputRecommendation[];
    products: OutputProduct[];
    confidence: number;
  } | null = null;
  let quality: QualityAssessment | null = null;

  try {
    modelResult = await generateModelOutput({
      input: inputSnapshot,
      candidates: topCandidates,
      queryExpansion,
    });

    // Self-consistency voting: disabled by default to avoid 3× Gemini spend on
    // every low-confidence result. Enable with ENABLE_SELF_CONSISTENCY_VOTING=1.
    const selfConsistencyEnabled = process.env.ENABLE_SELF_CONSISTENCY_VOTING === '1';
    const confidence = modelResult?.output?.confidence ?? modelResult?.output?.diagnosis?.confidence ?? 1;
    if (selfConsistencyEnabled && modelResult && typeof confidence === 'number' && confidence < 0.7) {
      const [r2, r3] = await Promise.allSettled([
        generateModelOutput({ input: inputSnapshot, candidates: topCandidates, queryExpansion }),
        generateModelOutput({ input: inputSnapshot, candidates: topCandidates, queryExpansion }),
      ]);
      const allResults = [
        modelResult,
        r2.status === 'fulfilled' ? r2.value : null,
        r3.status === 'fulfilled' ? r3.value : null,
      ].filter((r): r is ModelGenerationResult => r !== null);

      const votes = new Map<string, number>();
      for (const r of allResults) {
        const ct = r.output.diagnosis?.conditionType ?? 'unknown';
        votes.set(ct, (votes.get(ct) ?? 0) + 1);
      }
      const majority = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (majority && modelResult.output.diagnosis) {
        modelResult.output.diagnosis.conditionType = majority as OutputDiagnosis['conditionType'];
      }
    }

    if (!modelResult) {
      throw new Error('Model output unavailable. Heuristic fallback is disabled.');
    }

    normalized = normalizeOutput(modelResult.output, baseline, topCandidates);
    quality = assessNormalizedQuality(normalized, topCandidates, inputSnapshot);

    for (
      let attempt = 1;
      quality.needsRegeneration && attempt <= maxRegenerationAttempts;
      attempt += 1
    ) {
      const retryResult = await generateModelOutput({
        input: inputSnapshot,
        candidates: topCandidates,
        queryExpansion,
      });
      if (!retryResult) {
        continue;
      }

      const retryNormalized = normalizeOutput(retryResult.output, baseline, topCandidates);
      const retryQuality = assessNormalizedQuality(retryNormalized, topCandidates, inputSnapshot);
      if (
        retryQuality.score > quality.score ||
        (!retryQuality.needsRegeneration && quality.needsRegeneration)
      ) {
        modelResult = retryResult;
        normalized = retryNormalized;
        quality = retryQuality;
      }
    }

    if (
      usingDefaultModelGenerator &&
      normalized &&
      quality.needsRepair &&
      maxRepairAttempts > 0
    ) {
      for (let attempt = 1; attempt <= maxRepairAttempts; attempt += 1) {
        const repairPrompt = buildRepairPrompt({
          input: inputSnapshot,
          candidates: topCandidates,
          queryExpansion,
          draft: normalized,
          quality,
        });
        const repairedResult = await generateModelOutputFromProviders(
          {
            input: inputSnapshot,
            candidates: topCandidates,
            queryExpansion,
          },
          {
            promptOverride: repairPrompt,
          }
        );
        if (!repairedResult) {
          continue;
        }

        const repairedNormalized = normalizeOutput(
          repairedResult.output,
          baseline,
          topCandidates
        );
        const repairedQuality = assessNormalizedQuality(
          repairedNormalized,
          topCandidates,
          inputSnapshot
        );
        if (repairedQuality.score > quality.score) {
          modelResult = repairedResult;
          normalized = repairedNormalized;
          quality = repairedQuality;
        }
        if (!repairedQuality.needsRepair) {
          break;
        }
      }
    }
  } catch (error) {
    console.error('Model generation failed', {
      inputId: input.inputId,
      userId: input.userId,
      error: (error as Error).message,
    });
  }

  if (!modelResult) {
    throw new Error('Model output unavailable. Heuristic fallback is disabled.');
  }

  const finalNormalized =
    normalized ?? normalizeOutput(modelResult.output, baseline, topCandidates);
  const finalQuality = assessNormalizedQuality(finalNormalized, topCandidates, inputSnapshot);
  const hasTargetCrop = normalizeCropTerm(inputSnapshot.crop).length > 0;
  const qualityGateFailures: string[] = [];
  if (finalQuality.recommendationCount < 3) {
    qualityGateFailures.push('requires exactly 3 staged actions');
  }
  if (finalQuality.citationCoverage < 1) {
    qualityGateFailures.push('requires valid citation on every action');
  }
  if (hasTargetCrop && finalQuality.cropCitationCoverage < 0.8) {
    qualityGateFailures.push('requires crop-aligned evidence coverage');
  }
  if (
    finalQuality.diagnosisType === 'unknown' &&
    finalQuality.confidence < MIN_REQUIRED_CONFIDENCE &&
    finalQuality.weakEvidence
  ) {
    qualityGateFailures.push('unknown diagnosis with weak/low-confidence evidence');
  }

  if (qualityGateFailures.length > 0) {
    throw new Error(`Quality gate failed: ${qualityGateFailures.join('; ')}`);
  }

  const citedChunkIds = collectCitations(finalNormalized.recommendations, topCandidates);
  const sources = buildSources(citedChunkIds, topCandidates);
  const timestamp = now().toISOString();
  const recommendationId = randomUUID();

  await persistRetrievalAuditRecord({
    inputId: input.inputId,
    recommendationId,
    query: queryExpansion.expandedQuery,
    queryTerms: queryExpansion.terms,
    candidates: topCandidates,
    citedChunkIds,
  });

  return {
    recommendationId,
    confidence: finalNormalized.confidence,
    diagnosis: {
      diagnosis: finalNormalized.diagnosis,
      recommendations: finalNormalized.recommendations,
      products: finalNormalized.products,
      confidence: finalNormalized.confidence,
      generatedAt: timestamp,
      inputId: input.inputId,
      userId: input.userId,
      jobId: input.jobId,
      retrievalQuery: queryExpansion.expandedQuery,
    },
    sources,
    modelUsed: modelResult.model,
  };
}

type RecommendationModelProvider = 'anthropic' | 'gemini';

async function generateModelOutputFromProviders(
  params: ModelGenerationInput,
  options: ModelGenerationOptions = {}
): Promise<ModelGenerationResult | null> {
  const providers = resolveRecommendationModelProviders();
  const attempts = await Promise.all(
    providers.map(async (provider, providerOrder) => {
      try {
        const result =
          provider === 'anthropic'
            ? await generateModelOutputFromAnthropic(params, options.promptOverride)
            : await generateModelOutputFromGemini(params, options.promptOverride);
        if (!result) {
          return null;
        }
        const score = scoreModelOutputQuality(result.output, params.candidates);
        const confidence = clamp(
          Number(result.output.diagnosis?.confidence ?? result.output.confidence ?? 0),
          0,
          1
        );
        return {
          provider,
          providerOrder,
          score,
          confidence,
          result,
        };
      } catch (error) {
        console.error('Recommendation model provider failed', {
          provider,
          error: (error as Error).message,
        });
        return null;
      }
    })
  );

  const successful = attempts.filter(
    (
      entry
    ): entry is {
      provider: RecommendationModelProvider;
      providerOrder: number;
      score: number;
      confidence: number;
      result: ModelGenerationResult;
    } => entry !== null
  );

  if (successful.length === 0) {
    return null;
  }

  successful.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return a.providerOrder - b.providerOrder;
  });

  return successful[0].result;
}

function resolveRecommendationModelProviders(): RecommendationModelProvider[] {
  const raw = normalizeOptionalString(process.env.RECOMMENDATION_MODEL_PROVIDERS);
  const hasAnthropicCredentials = Boolean(
    normalizeOptionalString(process.env.ANTHROPIC_API_KEY) ||
      normalizeOptionalString(process.env.ANTHROPIC_AUTH_TOKEN)
  );
  const hasGeminiCredentials = Boolean(
    normalizeOptionalString(process.env.GOOGLE_AI_API_KEY)
  );

  const supportsProvider = (provider: RecommendationModelProvider): boolean => {
    if (provider === 'anthropic') {
      return hasAnthropicCredentials;
    }
    return hasGeminiCredentials;
  };

  const configuredProviders = raw
    ? raw
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0)
    : [];

  const parsedProviders: RecommendationModelProvider[] = [];
  for (const provider of configuredProviders) {
    if ((provider === 'anthropic' || provider === 'gemini') && !parsedProviders.includes(provider)) {
      parsedProviders.push(provider);
    }
  }

  if (parsedProviders.length > 0) {
    const availableConfiguredProviders = parsedProviders.filter((provider) =>
      supportsProvider(provider)
    );
    if (availableConfiguredProviders.length > 0) {
      return availableConfiguredProviders;
    }
    return parsedProviders;
  }

  const autoDetectedProviders: RecommendationModelProvider[] = [];
  if (hasAnthropicCredentials) {
    autoDetectedProviders.push('anthropic');
  }
  if (hasGeminiCredentials) {
    autoDetectedProviders.push('gemini');
  }
  if (autoDetectedProviders.length > 0) {
    return autoDetectedProviders;
  }

  return ['anthropic', 'gemini'];
}

function scoreModelOutputQuality(output: ModelOutput, candidates: RankedCandidate[]): number {
  let score = 0;
  const diagnosis = output.diagnosis;
  const diagnosisCondition = normalizeOptionalString(diagnosis?.condition);
  const diagnosisReasoning = normalizeOptionalString(diagnosis?.reasoning);
  const diagnosisType = normalizeConditionType(
    diagnosis?.conditionType,
    diagnosisCondition ?? 'unknown'
  );
  if (diagnosisCondition) {
    score += 10;
  }
  if (diagnosisReasoning) {
    score += 10;
  }
  score += diagnosisType === 'unknown' ? 2 : 8;

  const confidence = clamp(
    Number(diagnosis?.confidence ?? output.confidence ?? 0.5),
    0,
    1
  );
  score += Math.round(confidence * 10);

  const recommendations = Array.isArray(output.recommendations)
    ? output.recommendations
    : [];
  score += Math.min(20, recommendations.length * 10);

  const candidateIds = new Set(candidates.map((candidate) => candidate.chunkId));
  let citationScore = 0;
  for (const recommendation of recommendations.slice(0, 3)) {
    const citations = Array.isArray(recommendation.citations)
      ? recommendation.citations
          .map((entry) => normalizeOptionalString(entry))
          .filter((entry): entry is string => Boolean(entry))
      : [];
    const hasValidCitation = citations.some((citation) => candidateIds.has(citation));
    citationScore += hasValidCitation ? 8 : -5;
    if (normalizeOptionalString(recommendation.action)) {
      citationScore += 2;
    }
    if (normalizeOptionalString(recommendation.details)) {
      citationScore += 2;
    }
  }
  score += clamp(citationScore, -10, 30);

  if (Array.isArray(output.products) && output.products.length > 0) {
    score += 4;
  }

  return score;
}

async function loadInputSnapshotFromDatabase(
  inputId: string,
  userId: string
): Promise<InputSnapshot | null> {
  const pool = resolvePool();
  const result = await pool.query<{
    type: CreateInputCommand['type'];
    image_url: string | null;
    description: string | null;
    lab_data: unknown;
    location: string | null;
    crop: string | null;
    season: string | null;
  }>(
    `
      SELECT
        type,
        "imageUrl" AS image_url,
        description,
        "labData" AS lab_data,
        location,
        crop,
        season
      FROM "Input"
      WHERE id = $1
        AND "userId" = $2
      LIMIT 1
    `,
    [inputId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    type: row.type,
    imageUrl: row.image_url ?? undefined,
    description: row.description ?? undefined,
    labData:
      row.lab_data && typeof row.lab_data === 'object'
        ? (row.lab_data as Record<string, unknown>)
        : undefined,
    location: row.location ?? undefined,
    crop: row.crop ?? undefined,
    season: row.season ?? undefined,
  };
}

async function retrieveCandidatesFromKnowledgeBase(
  input: InputSnapshot,
  expansion: QueryExpansionResult
): Promise<RetrievedCandidate[]> {
  const pool = resolvePool();
  const limit = Number(process.env.RAG_RETRIEVAL_LIMIT ?? DEFAULT_RETRIEVAL_LIMIT);
  const embedding = await createEmbeddingWithFallback(expansion.expandedQuery);
  const cropTerm = normalizeCropTerm(input.crop);
  const cropHints = buildCropHints(cropTerm);
  const cropRegexPattern = buildCropSqlRegexPattern(cropHints);
  const cropHardFilter =
    cropRegexPattern
      ? `
        AND (
          (
            jsonb_typeof(s.metadata->'crops') = 'array' AND
            jsonb_array_length(s.metadata->'crops') > 0 AND
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(s.metadata->'crops') AS source_crop(value)
              WHERE lower(source_crop.value) = ANY($5::text[])
            )
          )
          OR (
            (
              s.metadata IS NULL OR
              s.metadata->'crops' IS NULL OR
              jsonb_typeof(s.metadata->'crops') <> 'array' OR
              jsonb_array_length(s.metadata->'crops') = 0
            ) AND (
              lower(t.content) ~ $4::text OR
              lower(s.title) ~ $4::text
            )
          )
        )
      `
      : '';

  if (!embedding) {
    return retrieveCandidatesLexical(pool, input, expansion, limit);
  }

  const vectorLiteral = `[${embedding.join(',')}]`;

  const rows = await pool.query<CandidateRow>(
    `
      SELECT
        t.id AS chunk_id,
        t.content,
        t.metadata,
        s.id AS source_id,
        s.title AS source_title,
        s."sourceType"::text AS source_type,
        s.institution,
        COALESCE(sb.boost, 0)::float8 AS source_boost,
        (1 - (t.embedding <=> $1::vector))::float8 AS similarity,
        (
          (1 - (t.embedding <=> $1::vector)) +
          CASE WHEN $2::text <> '' AND lower(t.content) LIKE '%' || lower($2) || '%' THEN 0.08 ELSE 0 END +
          CASE WHEN $2::text <> '' AND lower(s.title) LIKE '%' || lower($2) || '%' THEN 0.05 ELSE 0 END +
          CASE WHEN $2::text <> '' AND lower(coalesce(t.metadata::text, '')) LIKE '%' || lower($2) || '%' THEN 0.04 ELSE 0 END +
          COALESCE(sb.boost, 0)
        )::float8 AS hybrid_score
      FROM "TextChunk" t
      JOIN "Source" s ON s.id = t."sourceId"
      LEFT JOIN "SourceBoost" sb ON sb."sourceId" = s.id
      WHERE t.embedding IS NOT NULL
        AND s.status IN ('ready', 'processed')
        ${cropHardFilter}
      ORDER BY hybrid_score DESC
      LIMIT $3
    `,
    [vectorLiteral, cropTerm, limit, cropRegexPattern ?? '', cropHints]
  );

  const candidates = rows.rows
    .map((row) => toRetrievedCandidate(row))
    .filter((candidate) => !isLowSignalContent(candidate.content));
  if (candidates.length > 0) {
    return candidates;
  }

  return retrieveCandidatesLexical(pool, input, expansion, limit);
}

async function retrieveCandidatesLexical(
  pool: Pool,
  input: InputSnapshot,
  expansion: QueryExpansionResult,
  limit: number
): Promise<RetrievedCandidate[]> {
  const terms = expansion.terms
    .map((term) => term.toLowerCase().trim())
    .filter((term) => term.length >= 4)
    .slice(0, 10);
  if (terms.length === 0) {
    return [];
  }

  const patterns = terms.map((term) => `%${escapeLikePattern(term)}%`);
  const cropTerm = normalizeCropTerm(input.crop);
  const cropHints = buildCropHints(cropTerm);
  const cropRegexPattern = buildCropSqlRegexPattern(cropHints);
  const cropWordMatcher = buildCropWordRegex(cropHints);
  const cropConstraint =
    cropRegexPattern
      ? `
        AND (
          (
            jsonb_typeof(s.metadata->'crops') = 'array' AND
            jsonb_array_length(s.metadata->'crops') > 0 AND
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(s.metadata->'crops') AS source_crop(value)
              WHERE lower(source_crop.value) = ANY($4::text[])
            )
          )
          OR (
            (
              s.metadata IS NULL OR
              s.metadata->'crops' IS NULL OR
              jsonb_typeof(s.metadata->'crops') <> 'array' OR
              jsonb_array_length(s.metadata->'crops') = 0
            ) AND (
              lower(t.content) ~ $3::text OR
              lower(s.title) ~ $3::text
            )
          )
        )
      `
      : '';
  const rows = await pool.query<CandidateRow>(
    `
      SELECT
        t.id AS chunk_id,
        t.content,
        t.metadata,
        s.id AS source_id,
        s.title AS source_title,
        s."sourceType"::text AS source_type,
        s.institution,
        COALESCE(sb.boost, 0)::float8 AS source_boost,
        0::float8 AS similarity
      FROM "TextChunk" t
      JOIN "Source" s ON s.id = t."sourceId"
      LEFT JOIN "SourceBoost" sb ON sb."sourceId" = s.id
      WHERE s.status IN ('ready', 'processed')
        AND (
          lower(t.content) LIKE ANY($1::text[]) OR
          lower(s.title) LIKE ANY($1::text[]) OR
          lower(coalesce(t.metadata::text, '')) LIKE ANY($1::text[])
        )
        ${cropConstraint}
      ORDER BY t."createdAt" DESC
      LIMIT $2
    `,
    [patterns, limit * 5, cropRegexPattern ?? '', cropHints]
  );

  return rows.rows
    .map((row) => {
      const content = normalizeWhitespace(row.content);
      const lexicalScore = scoreLexicalMatch(content, terms);
      const contentLower = content.toLowerCase();
      const titleLower = row.source_title.toLowerCase();
      const cropMentioned =
        matchesCropWord(contentLower, cropWordMatcher) ||
        matchesCropWord(titleLower, cropWordMatcher);
      const cropBoost =
        cropHints.length > 0 && cropMentioned
          ? 0.2
          : 0;
      const sourceBoost = clamp(Number(row.source_boost ?? 0), -0.1, 0.25);

      return toRetrievedCandidate({
        ...row,
        similarity: Math.min(0.95, lexicalScore + cropBoost + sourceBoost),
      });
    })
    .filter((candidate) => candidate.similarity > 0.2)
    .filter((candidate) => !isLowSignalContent(candidate.content))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

function toRetrievedCandidate(row: CandidateRow): RetrievedCandidate {
  const metadata =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as RetrievedCandidate['metadata'])
      : undefined;
  const adjustedSimilarity = Number.isFinite(row.hybrid_score)
    ? clamp(Number(row.hybrid_score), 0, 1)
    : clamp(Number(row.similarity), 0, 1);

  return {
    chunkId: row.chunk_id,
    sourceId: row.source_id,
    content: normalizeWhitespace(row.content),
    similarity: adjustedSimilarity,
    sourceType: normalizeSourceType(row.source_type),
    sourceTitle: row.source_title,
    sourceBoost: Number.isFinite(Number(row.source_boost)) ? Number(row.source_boost) : 0,
    metadata,
  };
}

async function createEmbeddingWithFallback(
  query: string
): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';
  const timeoutMs = parsePositiveIntEnv(
    process.env.OPENAI_EMBEDDING_TIMEOUT_MS,
    DEFAULT_EMBEDDING_TIMEOUT_MS
  );
  try {
    const response = await fetchWithTimeout(
      'https://api.openai.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: query,
        }),
      },
      timeoutMs
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenAI embeddings request failed (${response.status}): ${errorBody.slice(0, 180)}`
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = payload.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('OpenAI embeddings payload was missing embedding values');
    }

    const numericEmbedding = embedding.map((value) => Number(value));
    if (numericEmbedding.some((value) => !Number.isFinite(value))) {
      throw new Error('OpenAI embeddings payload contained non-numeric values');
    }

    return numericEmbedding;
  } catch (error) {
    console.error('Failed to create embedding, falling back to lexical retrieval', {
      error: (error as Error).message,
    });
    return null;
  }
}

async function generateModelOutputFromAnthropic(
  params: ModelGenerationInput,
  promptOverride?: string
): Promise<ModelGenerationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  if (!apiKey && !authToken) {
    return null;
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5-20250929';
  const timeoutMs = parsePositiveIntEnv(
    process.env.RECOMMENDATION_MODEL_TIMEOUT_MS,
    DEFAULT_MODEL_TIMEOUT_MS
  );
  const systemPrompt =
    'You are an expert agronomy advisor. Use only supplied evidence chunks. Return strictly valid JSON only.';
  const prompt = promptOverride ?? buildModelPrompt(params);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };

  if (apiKey) {
    headers['x-api-key'] = apiKey;
  } else if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  }

  const response = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 1800,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Anthropic request failed (${response.status}): ${errorBody.slice(0, 180)}`
    );
  }

  const payload = (await response.json()) as {
    model?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = payload.content?.find((block) => block.type === 'text')?.text;
  if (!text) {
    throw new Error('Anthropic response did not include a text block');
  }

  const parsed = extractJsonObject(text);
  return {
    model: payload.model ?? model,
    output: parsed,
  };
}

async function generateModelOutputFromGemini(
  params: ModelGenerationInput,
  promptOverride?: string
): Promise<ModelGenerationResult | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  // Default to flash — structured JSON extraction does not require Pro-tier reasoning.
  // Override with GEMINI_RECOMMENDATION_MODEL=gemini-2.5-pro for higher accuracy.
  const preferredModel = process.env.GEMINI_RECOMMENDATION_MODEL?.trim() || 'gemini-2.5-flash';
  const fallbackModels = ['gemini-2.0-flash'];
  const models = [preferredModel, ...fallbackModels].filter(
    (model, index, all) => model.length > 0 && all.indexOf(model) === index
  );
  const prompt = promptOverride ?? buildModelPrompt(params);
  const failureReasons: string[] = [];

  for (const model of models) {
    const mimeVariants: Array<'application/json' | null> = ['application/json', null];
    for (const responseMimeType of mimeVariants) {
      const payload = await requestGeminiModel({
        apiKey,
        model,
        prompt,
        responseMimeType,
      });
      const text = extractGeminiText(payload);
      if (!text) {
        failureReasons.push(
          `${model}${responseMimeType ? ':json' : ':text'}:${describeGeminiNoText(payload)}`
        );
        continue;
      }

      try {
        const parsed = extractJsonObject(text);
        return {
          model: payload.modelVersion ?? model,
          output: parsed,
        };
      } catch (error) {
        const preview = text.replace(/\s+/g, ' ').slice(0, 800);
        throw new Error(`${(error as Error).message}. Gemini text preview: ${preview}`);
      }
    }
  }

  const reason = failureReasons.length > 0 ? ` (${failureReasons.slice(0, 4).join(' | ')})` : '';
  throw new Error(`Gemini response did not include text output${reason}`);
}

async function requestGeminiModel(params: {
  apiKey: string;
  model: string;
  prompt: string;
  responseMimeType: 'application/json' | null;
}): Promise<{
  modelVersion?: string;
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
}> {
  const timeoutMs = parsePositiveIntEnv(
    process.env.RECOMMENDATION_MODEL_TIMEOUT_MS,
    DEFAULT_MODEL_TIMEOUT_MS
  );
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${params.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: params.prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          ...(params.responseMimeType ? { responseMimeType: params.responseMimeType } : {}),
        },
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Gemini request failed (${response.status}): ${errorBody.slice(0, 180)}`
    );
  }

  return (await response.json()) as {
    modelVersion?: string;
    promptFeedback?: { blockReason?: string };
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
}

function extractGeminiText(payload: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}): string | null {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate.content?.parts) ? candidate.content?.parts : [];
    const text = parts
      .map((part) => normalizeOptionalString(part.text))
      .filter((part): part is string => Boolean(part))
      .join(' ')
      .trim();
    if (text.length > 0) {
      return text;
    }
  }
  return null;
}

function describeGeminiNoText(payload: {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{ finishReason?: string }>;
}): string {
  const blockReason = normalizeOptionalString(payload.promptFeedback?.blockReason);
  const finishReasons = (payload.candidates ?? [])
    .map((candidate) => normalizeOptionalString(candidate.finishReason))
    .filter((reason): reason is string => Boolean(reason));
  const reasonParts = [
    ...(blockReason ? [`blocked=${blockReason}`] : []),
    ...(finishReasons.length > 0 ? [`finish=${finishReasons.join(',')}`] : []),
  ];

  return reasonParts.length > 0 ? reasonParts.join(';') : 'empty-candidate-content';
}

function buildModelPrompt(params: ModelGenerationInput): string {
  const chunkLines = params.candidates.slice(0, MAX_CONTEXT_CANDIDATES).map((candidate) => {
    const excerpt = candidate.content.length > 700
      ? `${candidate.content.slice(0, 697)}...`
      : candidate.content;
    return [
      `chunkId=${candidate.chunkId}`,
      `sourceType=${candidate.sourceType}`,
      `sourceTitle=${candidate.sourceTitle}`,
      `similarity=${candidate.similarity.toFixed(3)}`,
      `content=${excerpt}`,
    ].join('\n');
  });

  return [
    'Return JSON with this schema only:',
    '{"diagnosis":{"condition":"","conditionType":"deficiency|disease|pest|environmental|unknown","confidence":0.0,"reasoning":""},"recommendations":[{"action":"","priority":"immediate|soon|when_convenient","timing":"","details":"","citations":["chunkId"]}],"products":[{"productId":"","reason":"","applicationRate":"","alternatives":["id"]}],"confidence":0.0}',
    '',
    'Rules:',
    '- Base claims only on evidence chunks listed below.',
    '- Every recommendation must include at least one valid citation chunkId.',
    '- Use crop and symptoms to avoid cross-crop mismatch.',
    '- Prefer the single most likely diagnosis when evidence supports it; use unknown only when evidence is contradictory or clearly insufficient.',
    '- If diagnosis is unknown, reasoning must name the top 2 likely alternatives and what evidence would disambiguate them.',
    '- Return exactly 3 recommendations with staged timing (immediate, soon, follow-up).',
    '- Include concrete field checks, thresholds, or measurements in recommendation details.',
    '- Use confidence between 0.55 and 0.90; do not default to 0.50 unless evidence is extremely weak.',
    '- Provide nuanced diagnosis reasoning grounded in observed symptoms, risk factors, and counter-signals.',
    '- Recommendation details should be practical and specific (not generic placeholders).',
    '- Return at most 3 products.',
    '- Never include markdown fences or extra prose outside JSON.',
    '',
    `Input: ${JSON.stringify({
      type: params.input.type,
      crop: params.input.crop,
      location: params.input.location,
      season: params.input.season,
      description: params.input.description,
      labData: params.input.labData,
      query: params.queryExpansion.expandedQuery,
    })}`,
    '',
    'Evidence chunks:',
    chunkLines.join('\n\n'),
  ].join('\n');
}

function buildRepairPrompt(params: {
  input: InputSnapshot;
  candidates: RankedCandidate[];
  queryExpansion: QueryExpansionResult;
  draft: {
    diagnosis: OutputDiagnosis;
    recommendations: OutputRecommendation[];
    products: OutputProduct[];
    confidence: number;
  };
  quality: QualityAssessment;
}): string {
  const evidence = params.candidates.slice(0, MAX_CONTEXT_CANDIDATES).map((candidate) => ({
    chunkId: candidate.chunkId,
    sourceTitle: candidate.sourceTitle,
    sourceType: candidate.sourceType,
    similarity: Number(candidate.similarity.toFixed(3)),
    excerpt: candidate.content.slice(0, 900),
  }));

  return [
    'Return JSON with this schema only:',
    '{"diagnosis":{"condition":"","conditionType":"deficiency|disease|pest|environmental|unknown","confidence":0.0,"reasoning":""},"recommendations":[{"action":"","priority":"immediate|soon|when_convenient","timing":"","details":"","citations":["chunkId"]}],"products":[{"productId":"","reason":"","applicationRate":"","alternatives":["id"]}],"confidence":0.0}',
    '',
    'You are revising a draft agronomy recommendation that failed quality checks.',
    'Quality issues to fix:',
    ...params.quality.reasons.map((reason) => `- ${reason}`),
    '',
    'Revision requirements:',
    '- Preserve evidence fidelity. Do not introduce claims not supported by evidence.',
    '- Produce exactly 3 recommendations with staged timing (immediate, soon, follow-up).',
    '- Every recommendation must cite one or more valid chunkIds from the evidence list.',
    '- Strengthen diagnosis reasoning with nuanced symptom interpretation and uncertainty handling.',
    '- If diagnosis remains unknown, include top 2 likely alternatives and clear disambiguation steps.',
    '- Keep product suggestions only when diagnosis confidence and evidence support them.',
    '- No markdown fences. JSON only.',
    '',
    `Input: ${JSON.stringify({
      type: params.input.type,
      crop: params.input.crop,
      location: params.input.location,
      season: params.input.season,
      description: params.input.description,
      labData: params.input.labData,
      query: params.queryExpansion.expandedQuery,
    })}`,
    '',
    `Draft output to improve: ${JSON.stringify(params.draft)}`,
    '',
    `Evidence chunks: ${JSON.stringify(evidence)}`,
  ].join('\n');
}

function buildNormalizationBaseline(candidates: RankedCandidate[]): ModelOutput {
  const citationIds = candidates.slice(0, 2).map((candidate) => candidate.chunkId);
  return {
    diagnosis: {
      condition: 'unknown_condition',
      conditionType: 'unknown',
      confidence: 0.6,
      reasoning:
        'Model returned partial output. Apply conservative verification steps before application.',
    },
    recommendations: [
      {
        action: 'Scout representative zones before treatment.',
        priority: 'immediate',
        timing: 'Within 24-48 hours',
        details:
          'Validate field variability and confirm diagnosis with representative samples from affected and healthy areas.',
        citations: citationIds,
      },
      {
        action: 'Confirm label and timing constraints before application.',
        priority: 'soon',
        timing: 'Next 3-5 days',
        details: 'Review REI/PHI and local registration requirements before spraying.',
        citations: citationIds.slice(0, 1),
      },
      {
        action: 'Re-evaluate response and refine intervention threshold.',
        priority: 'when_convenient',
        timing: 'Within 7 days',
        details:
          'Track symptom progression by zone and only escalate treatment when spread or severity continues to increase.',
        citations: citationIds.slice(0, 1),
      },
    ],
    products: [],
    confidence: 0.6,
  };
}

function normalizeOutput(
  model: ModelOutput,
  fallback: ModelOutput,
  candidates: RankedCandidate[]
): {
  diagnosis: OutputDiagnosis;
  recommendations: OutputRecommendation[];
  products: OutputProduct[];
  confidence: number;
} {
  const fallbackDiagnosis = {
    condition: normalizeNonEmptyString(fallback.diagnosis?.condition, 'unknown'),
    conditionType: normalizeConditionType(fallback.diagnosis?.conditionType, 'unknown'),
    confidence: clamp(Number(fallback.diagnosis?.confidence ?? 0.6), 0.5, 0.95),
    reasoning: normalizeNonEmptyString(
      fallback.diagnosis?.reasoning,
      'No model output available.'
    ),
  };

  const rawDiagnosisConfidence = clamp(
    Number(model.diagnosis?.confidence ?? model.confidence ?? fallbackDiagnosis.confidence),
    0.4,
    0.95
  );
  const diagnosisCondition = normalizeNonEmptyString(
    model.diagnosis?.condition,
    fallbackDiagnosis.condition
  );
  const diagnosisType = normalizeConditionType(
    model.diagnosis?.conditionType,
    diagnosisCondition
  );
  const reasoning = normalizeNonEmptyString(
    model.diagnosis?.reasoning,
    fallbackDiagnosis.reasoning
  );

  const candidateIds = new Set(candidates.map((candidate) => candidate.chunkId));
  const recommendations = (
    Array.isArray(model.recommendations) && model.recommendations.length > 0
      ? model.recommendations
      : fallback.recommendations ?? []
  )
    .map((recommendation) => {
      const citations = normalizeCitations(
        recommendation.citations,
        candidateIds,
        candidates.map((candidate) => candidate.chunkId)
      );

      return {
        action: normalizeNonEmptyString(
          recommendation.action,
          'Validate field symptoms before acting.'
        ),
        priority: normalizePriority(recommendation.priority),
        timing: normalizeOptionalString(recommendation.timing),
        details: normalizeNonEmptyString(
          recommendation.details,
          'Use representative scouting observations and supporting evidence.'
        ),
        citations,
      };
    })
    .slice(0, 3);

  if (recommendations.length < 3) {
    const fallbackRecommendations = (fallback.recommendations ?? []).map((recommendation) => ({
      action: normalizeNonEmptyString(
        recommendation.action,
        'Validate field symptoms before acting.'
      ),
      priority: normalizePriority(recommendation.priority),
      timing: normalizeOptionalString(recommendation.timing),
      details: normalizeNonEmptyString(
        recommendation.details,
        'Use representative scouting observations and supporting evidence.'
      ),
      citations: normalizeCitations(
        recommendation.citations,
        candidateIds,
        candidates.map((candidate) => candidate.chunkId)
      ),
    }));

    for (const fallbackRecommendation of fallbackRecommendations) {
      if (recommendations.length >= 3) {
        break;
      }
      const duplicate = recommendations.some(
        (existing) =>
          existing.action.toLowerCase() === fallbackRecommendation.action.toLowerCase()
      );
      if (!duplicate) {
        recommendations.push(fallbackRecommendation);
      }
    }
  }

  if (recommendations.length < 3 && candidates.length > 0) {
    const defaultCitation = candidates[0]?.chunkId ? [candidates[0].chunkId] : [];
    while (recommendations.length < 3) {
      recommendations.push({
        action: 'Re-check field progression and adjust plan.',
        priority: 'soon',
        timing: 'Reassess in 3-5 days',
        details:
          'Log severity change by zone and adjust treatment only when progression exceeds your intervention threshold.',
        citations: defaultCitation,
      });
    }
  }

  const stagedRecommendations = enforceStagedRecommendations(recommendations);

  const diagnosisConfidence = calibrateDiagnosisConfidence({
    rawConfidence: rawDiagnosisConfidence,
    diagnosisType,
    reasoning,
    recommendations: stagedRecommendations,
    candidates,
  });

  const products = (Array.isArray(model.products) ? model.products : [])
    .map((product): OutputProduct | null => {
      const productId = normalizeOptionalString(product.productId);
      const reason = normalizeOptionalString(product.reason);
      if (!productId || !reason) {
        return null;
      }

      const normalizedProduct: OutputProduct = {
        productId,
        reason,
      };

      const applicationRate = normalizeOptionalString(product.applicationRate);
      if (applicationRate) {
        normalizedProduct.applicationRate = applicationRate;
      }

      const alternatives = Array.isArray(product.alternatives)
        ? product.alternatives
            .map((entry) => normalizeOptionalString(entry))
            .filter((entry): entry is string => Boolean(entry))
            .slice(0, 4)
        : [];
      if (alternatives.length > 0) {
        normalizedProduct.alternatives = alternatives;
      }

      return normalizedProduct;
    })
    .filter((entry): entry is OutputProduct => entry !== null)
    .slice(0, 3);

  return {
    diagnosis: {
      condition: diagnosisCondition,
      conditionType: diagnosisType,
      confidence: diagnosisConfidence,
      reasoning,
    },
    recommendations: stagedRecommendations,
    products,
    confidence: diagnosisConfidence,
  };
}

function enforceStagedRecommendations(
  recommendations: OutputRecommendation[]
): OutputRecommendation[] {
  const requiredPriorities: OutputRecommendation['priority'][] = [
    'immediate',
    'soon',
    'when_convenient',
  ];
  const defaultTimingByPriority: Record<OutputRecommendation['priority'], string> = {
    immediate: 'Within 24-48 hours',
    soon: 'Next 3-5 days',
    when_convenient: 'Within 7-10 days',
  };

  return recommendations.slice(0, 3).map((recommendation, index) => {
    const priority = requiredPriorities[index] ?? recommendation.priority;
    return {
      ...recommendation,
      priority,
      timing: recommendation.timing ?? defaultTimingByPriority[priority],
    };
  });
}

function assessNormalizedQuality(
  normalized: {
    diagnosis: OutputDiagnosis;
    recommendations: OutputRecommendation[];
    products: OutputProduct[];
    confidence: number;
  },
  candidates: RankedCandidate[],
  input: InputSnapshot
): QualityAssessment {
  const reasons: string[] = [];
  const candidateMap = new Map(candidates.map((candidate) => [candidate.chunkId, candidate]));
  const recommendationCount = normalized.recommendations.length;
  const recommendationsWithValidCitation = normalized.recommendations.filter((recommendation) =>
    recommendation.citations.some((citation) => candidateMap.has(citation))
  ).length;
  const citationCoverage =
    recommendationCount > 0 ? recommendationsWithValidCitation / recommendationCount : 0;

  const uniqueCitations = new Set(
    normalized.recommendations.flatMap((recommendation) => recommendation.citations)
  );
  const cropHints = buildCropHints(normalizeCropTerm(input.crop));
  const cropMatcher = buildCropWordRegex(cropHints);
  const cropAlignedCitations = [...uniqueCitations].filter((chunkId) => {
    const candidate = candidateMap.get(chunkId);
    if (!candidate) {
      return false;
    }
    const metadataCrops = extractCandidateMetadataCrops(candidate);
    if (
      metadataCrops.length > 0 &&
      cropHints.some((hint) => metadataCrops.includes(normalizeCropCanonical(hint)))
    ) {
      return true;
    }
    if (!cropMatcher) {
      return true;
    }
    const haystack = `${candidate.sourceTitle.toLowerCase()} ${candidate.content.toLowerCase()}`;
    return matchesCropWord(haystack, cropMatcher);
  }).length;
  const cropCitationCoverage =
    uniqueCitations.size > 0 ? cropAlignedCitations / uniqueCitations.size : 1;

  const avgEvidenceSimilarity =
    candidates.length > 0
      ? candidates.reduce((sum, candidate) => sum + candidate.similarity, 0) / candidates.length
      : 0;
  const diagnosisUnknown =
    normalized.diagnosis.conditionType === 'unknown' ||
    /(unknown|undetermined|uncertain)/i.test(normalized.diagnosis.condition);
  const lowConfidence = normalized.confidence < MIN_REQUIRED_CONFIDENCE;
  const weakEvidence =
    candidates.length < 3 ||
    avgEvidenceSimilarity < 0.44 ||
    citationCoverage < 0.67 ||
    cropCitationCoverage < 0.55;

  const shortReasoning = normalized.diagnosis.reasoning.trim().length < 120;
  const genericActionCount = normalized.recommendations.filter((recommendation) =>
    isGenericActionDetails(recommendation.details)
  ).length;

  if (diagnosisUnknown) {
    reasons.push('Diagnosis is unknown or uncertain.');
  }
  if (lowConfidence) {
    reasons.push('Diagnosis confidence below 0.60.');
  }
  if (recommendationCount < 3) {
    reasons.push('Less than 3 staged recommendations.');
  }
  if (citationCoverage < 1) {
    reasons.push('One or more recommendations are missing valid citations.');
  }
  if (cropCitationCoverage < 0.8 && cropHints.length > 0) {
    reasons.push('Citations are weakly aligned to the target crop.');
  }
  if (shortReasoning) {
    reasons.push('Diagnosis reasoning lacks enough depth.');
  }
  if (genericActionCount > 0) {
    reasons.push('Recommendation details are too generic.');
  }

  let score = 0;
  score += diagnosisUnknown ? 8 : 20;
  score += Math.round(clamp(normalized.confidence, 0, 1) * 15);
  score += Math.round(clamp((recommendationCount / 3) * 20, 0, 20));
  score += Math.round(clamp(citationCoverage * 20, 0, 20));
  score += Math.round(clamp(cropCitationCoverage * 15, 0, 15));
  score += Math.round(clamp(avgEvidenceSimilarity * 10, 0, 10));
  if (shortReasoning) {
    score -= 6;
  }
  score -= genericActionCount * 3;
  score = Math.max(0, score);

  const needsRegeneration = diagnosisUnknown && lowConfidence && weakEvidence;
  const needsRepair =
    needsRegeneration ||
    recommendationCount < 3 ||
    citationCoverage < 1 ||
    cropCitationCoverage < 0.8 ||
    shortReasoning ||
    genericActionCount > 0 ||
    lowConfidence;

  return {
    score,
    needsRegeneration,
    needsRepair,
    reasons,
    diagnosisType: normalized.diagnosis.conditionType,
    confidence: normalized.confidence,
    recommendationCount,
    citationCoverage,
    cropCitationCoverage,
    weakEvidence,
  };
}

function calibrateDiagnosisConfidence(params: {
  rawConfidence: number;
  diagnosisType: OutputDiagnosis['conditionType'];
  reasoning: string;
  recommendations: OutputRecommendation[];
  candidates: RankedCandidate[];
}): number {
  let confidence = clamp(params.rawConfidence, 0.45, 0.95);
  const hasExplicitEvidenceGap = mentionsEvidenceGap(params.reasoning, params.recommendations);
  const citationCount = new Set(
    params.recommendations.flatMap((recommendation) => recommendation.citations)
  ).size;
  const avgSimilarity =
    params.candidates.length > 0
      ? params.candidates.reduce((sum, candidate) => sum + candidate.similarity, 0) /
        params.candidates.length
      : 0;

  if (confidence < 0.55) {
    if (hasExplicitEvidenceGap && params.diagnosisType === 'unknown') {
      confidence = 0.5;
    } else {
      confidence = 0.58;
    }
  }

  if (params.diagnosisType !== 'unknown' && citationCount >= 2 && avgSimilarity >= 0.5) {
    confidence = Math.max(confidence, 0.62);
  }

  if (params.diagnosisType === 'unknown' && !hasExplicitEvidenceGap) {
    confidence = Math.max(confidence, 0.6);
  }

  if (avgSimilarity < 0.42 && confidence > 0.82) {
    confidence = 0.82;
  }

  return clamp(confidence, 0.5, 0.92);
}

function mentionsEvidenceGap(
  reasoning: string,
  recommendations: OutputRecommendation[]
): boolean {
  const gapPattern =
    /(insufficient|inconclusive|uncertain|not enough|limited evidence|confirm|verify|collect sample|lab|diagnostic)/i;
  if (gapPattern.test(reasoning)) {
    return true;
  }

  return recommendations.some((recommendation) =>
    gapPattern.test(`${recommendation.action} ${recommendation.details}`)
  );
}

function isGenericActionDetails(details: string): boolean {
  const normalized = details.trim().toLowerCase();
  if (normalized.length < 90) {
    return true;
  }
  return /(monitor|track progression|confirm diagnosis|check label|scout additional zones)/i.test(
    normalized
  ) && normalized.length < 180;
}

function collectCitations(
  recommendations: OutputRecommendation[],
  candidates: RankedCandidate[]
): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const recommendation of recommendations) {
    for (const citation of recommendation.citations) {
      if (seen.has(citation)) {
        continue;
      }
      seen.add(citation);
      deduped.push(citation);
    }
  }

  if (deduped.length === 0 && candidates.length > 0) {
    deduped.push(candidates[0].chunkId);
  }

  return deduped.slice(0, 4);
}

function buildSources(
  chunkIds: string[],
  candidates: RankedCandidate[]
): RecommendationResult['sources'] {
  const candidateMap = new Map(candidates.map((candidate) => [candidate.chunkId, candidate]));
  const sources: RecommendationResult['sources'] = [];

  for (const chunkId of chunkIds) {
    const candidate = candidateMap.get(chunkId);
    if (!candidate) {
      continue;
    }

    sources.push({
      chunkId: candidate.chunkId,
      relevance: clamp(candidate.rankScore, 0, 1),
      excerpt: candidate.content.slice(0, 300),
    });
  }

  return sources;
}

async function persistRetrievalAuditRecord(params: {
  inputId: string;
  recommendationId: string;
  query: string;
  queryTerms: string[];
  candidates: RankedCandidate[];
  citedChunkIds: string[];
}): Promise<void> {
  if (process.env.DISABLE_RETRIEVAL_AUDIT === '1') {
    return;
  }
  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    const pool = resolvePool();
    const citedSet = new Set(params.citedChunkIds);

    const candidateChunks = params.candidates.map((candidate) => ({
      id: candidate.chunkId,
      sourceId: candidate.sourceId ?? null,
      similarity: candidate.similarity,
      rankScore: candidate.rankScore,
      sourceType: candidate.sourceType,
      cited: citedSet.has(candidate.chunkId),
      assembled: true,
      type: 'text',
    }));
    const usedChunks = candidateChunks.filter((chunk) => chunk.cited);
    const missedChunks = candidateChunks.filter(
      (chunk) => !chunk.cited && chunk.similarity >= 0.45
    );

    await pool.query(
      `
        INSERT INTO "RetrievalAudit" (
          id,
          "inputId",
          "recommendationId",
          query,
          topics,
          "sourceHints",
          "requiredSourceIds",
          "candidateChunks",
          "usedChunks",
          "missedChunks",
          "createdAt"
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::text[],
          $6::text[],
          $7::text[],
          $8::jsonb,
          $9::jsonb,
          $10::jsonb,
          NOW()
        )
      `,
      [
        randomUUID(),
        params.inputId,
        null,
        params.query,
        params.queryTerms.slice(0, 12),
        [],
        [],
        JSON.stringify(candidateChunks),
        JSON.stringify(usedChunks),
        JSON.stringify(missedChunks),
      ]
    );
  } catch (error) {
    console.error('Failed to persist retrieval audit record', {
      inputId: params.inputId,
      recommendationId: params.recommendationId,
      error: (error as Error).message,
    });
  }
}

function buildRetrievalQueryFromInput(input: InputSnapshot): string {
  const parts: string[] = [];
  if (input.crop) {
    parts.push(`crop ${input.crop}`);
  }
  if (input.location) {
    parts.push(`location ${input.location}`);
  }
  if (input.season) {
    parts.push(`season ${input.season}`);
  }
  if (input.description) {
    parts.push(input.description);
  }
  if (input.labData) {
    parts.push(JSON.stringify(input.labData));
  }

  if (parts.length === 0) {
    return 'crop diagnosis';
  }

  return parts.join(' ');
}

function inferCondition(text: string): {
  condition: string;
  conditionType: OutputDiagnosis['conditionType'];
} {
  if (
    /(chlorosis|deficien|nutrient|yellowing between veins|interveinal|leaf tissue turning.*yellow)/.test(
      text
    ) ||
    /(veins?\s+(are\s+)?(still|remain)\s+green[\w\s,.;:-]{0,120}(yellow|yellowing|chlorosis))/.test(
      text
    ) ||
    /((new|newer|young|younger)\s+leaves?.{0,90}(yellow|yellowing|chlorosis|stunting))/.test(
      text
    ) ||
    /(new growth.{0,60}(stunting|yellow|yellowing|chlorosis))/.test(text)
  ) {
    return {
      condition: 'probable_nutrient_deficiency_or_root_stress',
      conditionType: 'deficiency',
    };
  }
  if (/(lesion|blight|rot|mold|fung|bacter|viral|disease)/.test(text)) {
    return {
      condition: 'probable_foliar_disease',
      conditionType: 'disease',
    };
  }
  const hasPestSignal = /(aphid|insect|mite|worm|beetle|larva|pest)/.test(text);
  const hasNegatedPestSignal =
    /(no|without|not|absence of)\s+(obvious\s+)?((insect|mite|worm|beetle|larva|pest)(\s+feeding)?|signs?\s+of\s+(insect|mite|worm|beetle|larva|pest))/i
      .test(text);
  if (hasPestSignal && !hasNegatedPestSignal) {
    return {
      condition: 'probable_insect_pressure',
      conditionType: 'pest',
    };
  }
  if (/(drought|frost|heat|waterlogging|environment)/.test(text)) {
    return {
      condition: 'probable_environmental_stress',
      conditionType: 'environmental',
    };
  }
  return {
    condition: 'uncertain_field_issue',
    conditionType: 'unknown',
  };
}

function normalizeCropTerm(crop: string | undefined): string {
  return (crop ?? '').trim().toLowerCase();
}

function buildCropHints(cropTerm: string): string[] {
  if (!cropTerm) {
    return [];
  }

  const hints = new Set<string>([cropTerm]);
  if (cropTerm.endsWith('s')) {
    hints.add(cropTerm.slice(0, -1));
  } else {
    hints.add(`${cropTerm}s`);
  }

  if (cropTerm === 'corn') {
    hints.add('maize');
  }
  if (cropTerm === 'soybean') {
    hints.add('soybeans');
    hints.add('soya');
  }
  if (cropTerm === 'soybeans') {
    hints.add('soybean');
    hints.add('soya');
  }
  if (cropTerm === 'sugarbeet') {
    hints.add('sugar beet');
  }
  if (cropTerm === 'sugar beet') {
    hints.add('sugarbeet');
  }

  return [...hints].filter((hint) => hint.length >= 3);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCropWordRegex(cropHints: string[]): RegExp | null {
  if (cropHints.length === 0) {
    return null;
  }
  const alt = cropHints
    .map((hint) => escapeRegex(hint))
    .sort((a, b) => b.length - a.length)
    .join('|');
  return new RegExp(`(^|[^a-z0-9])(?:${alt})([^a-z0-9]|$)`, 'i');
}

function buildCropSqlRegexPattern(cropHints: string[]): string | null {
  const regex = buildCropWordRegex(cropHints);
  return regex ? regex.source : null;
}

function matchesCropWord(value: string, matcher: RegExp | null): boolean {
  if (!matcher) {
    return false;
  }
  matcher.lastIndex = 0;
  return matcher.test(value);
}

function filterCandidatesForDiagnosis(
  candidates: RankedCandidate[],
  input: InputSnapshot
): RankedCandidate[] {
  const cropTerm = normalizeCropTerm(input.crop);
  const cropMatcher = buildCropWordRegex(buildCropHints(cropTerm));
  const targetCanonicalCrop = normalizeCropCanonical(cropTerm);
  const targetCropAliases = new Set(
    buildCropHints(cropTerm).map((hint) => normalizeCropCanonical(hint))
  );

  return candidates.filter((candidate) => {
    const title = candidate.sourceTitle.toLowerCase();
    const content = candidate.content.toLowerCase();
    const sourceType = candidate.sourceType;
    const candidateCropMentions = detectCropMentions(`${title} ${content}`);
    const metadataCrops = extractCandidateMetadataCrops(candidate);
    const hasMetadataMismatch =
      targetCropAliases.size > 0 &&
      metadataCrops.length > 0 &&
      !metadataCrops.some((entry) => targetCropAliases.has(entry));
    if (hasMetadataMismatch) {
      return false;
    }

    if (
      targetCanonicalCrop &&
      candidateCropMentions.size > 0 &&
      !candidateCropMentions.has(targetCanonicalCrop)
    ) {
      return false;
    }

    if (targetCanonicalCrop) {
      const hasReliableCropSignal =
        metadataCrops.some((entry) => targetCropAliases.has(entry)) ||
        candidateCropMentions.has(targetCanonicalCrop);
      const genericPattern =
        /(starting|commercial nursery|general guide|general knowledge|regulatory|certification|overview)/;
      if (!hasReliableCropSignal && genericPattern.test(`${title} ${content}`)) {
        return false;
      }
    }

    if (sourceType === 'GOVERNMENT') {
      const administrativePattern =
        /(registered for use|invasive plant|regulation|regulations|code of|chapter|statute|administrative|certification manual|rules of|pesticide act)/;
      if (administrativePattern.test(title)) {
        return false;
      }

      if (cropMatcher && !matchesCropWord(`${title} ${content}`, cropMatcher)) {
        return false;
      }
    }

    return true;
  });
}

function isCropAlignedCandidate(candidate: RankedCandidate, cropTerm: string): boolean {
  const targetAliases = new Set(
    buildCropHints(cropTerm).map((hint) => normalizeCropCanonical(hint))
  );
  if (targetAliases.size === 0) {
    return true;
  }

  const metadataCrops = extractCandidateMetadataCrops(candidate);
  const hasMetadataCropMatch = metadataCrops.some((entry) => targetAliases.has(entry));
  if (hasMetadataCropMatch) {
    return true;
  }

  const titleMentions = detectCropMentions(candidate.sourceTitle.toLowerCase());
  const hasTitleCropMatch = [...targetAliases].some((alias) => titleMentions.has(alias));
  const mentions = detectCropMentions(
    `${candidate.sourceTitle.toLowerCase()} ${candidate.content.toLowerCase()}`
  );
  const hasTargetMention = [...targetAliases].some((alias) => mentions.has(alias));
  if (!hasTargetMention) {
    return false;
  }

  // Reject broad multi-crop digests unless they are explicitly crop-focused in title/metadata.
  if (!hasTitleCropMatch && mentions.size > 4) {
    return false;
  }

  return true;
}

function extractCandidateMetadataCrops(candidate: RankedCandidate): string[] {
  const rawCrops = candidate.metadata?.crops;
  if (!Array.isArray(rawCrops)) {
    return [];
  }

  return rawCrops
    .map((entry) => normalizeCropCanonical(normalizeCropTerm(entry)))
    .filter((entry): entry is string => entry.length > 0);
}

function detectCropMentions(text: string): Set<string> {
  const mentions = new Set<string>();
  for (const entry of CROP_ALIAS_MATCHERS) {
    if (entry.matcher.test(text)) {
      mentions.add(entry.canonical);
    }
  }
  return mentions;
}

function normalizeCropCanonical(cropTerm: string): string {
  if (!cropTerm) {
    return '';
  }

  return CROP_ALIAS_TO_CANONICAL.get(cropTerm) ?? cropTerm;
}

function buildCropAliasEntries(): Array<{ canonical: string; alias: string }> {
  const aliases = new Map<string, string>();
  const addAlias = (canonical: string, alias: string): void => {
    const normalizedAlias = normalizeCropTerm(alias);
    if (!normalizedAlias) {
      return;
    }
    aliases.set(normalizedAlias, canonical);
  };

  for (const crop of CROPS) {
    const canonical = normalizeCropTerm(crop);
    addAlias(canonical, canonical);
    if (canonical.endsWith('s')) {
      addAlias(canonical, canonical.slice(0, -1));
    } else {
      addAlias(canonical, `${canonical}s`);
    }
  }

  addAlias('corn', 'maize');
  addAlias('soybeans', 'soybean');
  addAlias('soybeans', 'soya');
  addAlias('peaches', 'peach');
  addAlias('grapes', 'grape');
  addAlias('blueberries', 'blueberry');
  addAlias('strawberries', 'strawberry');
  addAlias('sugarbeet', 'sugar beet');
  addAlias('tomatoes', 'tomato');
  addAlias('potatoes', 'potato');
  addAlias('onions', 'onion');
  addAlias('carrots', 'carrot');
  addAlias('cucumbers', 'cucumber');
  addAlias('peppers', 'pepper');
  addAlias('apples', 'apple');
  addAlias('almonds', 'almond');

  return [...aliases.entries()].map(([alias, canonical]) => ({
    canonical,
    alias,
  }));
}

function normalizeSourceType(raw: string): SourceAuthorityType {
  if (
    raw === 'GOVERNMENT' ||
    raw === 'UNIVERSITY_EXTENSION' ||
    raw === 'RESEARCH_PAPER' ||
    raw === 'MANUFACTURER' ||
    raw === 'RETAILER'
  ) {
    return raw;
  }

  return 'OTHER';
}

function normalizeConditionType(raw: unknown, condition: string): OutputDiagnosis['conditionType'] {
  if (typeof raw === 'string' && CONDITION_TYPES.has(raw)) {
    return raw as OutputDiagnosis['conditionType'];
  }

  const inferred = inferCondition(condition.toLowerCase());
  return inferred.conditionType;
}

function normalizePriority(raw: unknown): OutputRecommendation['priority'] {
  if (typeof raw === 'string' && RECOMMENDATION_PRIORITIES.has(raw)) {
    return raw as OutputRecommendation['priority'];
  }

  return 'soon';
}

function normalizeCitations(
  raw: unknown,
  candidateIds: Set<string>,
  orderedCandidateIds: string[]
): string[] {
  const citations = Array.isArray(raw)
    ? raw
        .map((item) => normalizeOptionalString(item))
        .filter((item): item is string => Boolean(item))
    : [];
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const citation of citations) {
    if (!candidateIds.has(citation) || seen.has(citation)) {
      continue;
    }
    seen.add(citation);
    deduped.push(citation);
  }

  if (deduped.length === 0 && orderedCandidateIds.length > 0) {
    deduped.push(orderedCandidateIds[0]);
  }

  return deduped.slice(0, 3);
}

function normalizeNonEmptyString(value: unknown, fallback: string): string {
  const normalized = normalizeOptionalString(value);
  return normalized ?? fallback;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function scoreLexicalMatch(content: string, terms: string[]): number {
  if (terms.length === 0) {
    return 0;
  }

  const lowered = content.toLowerCase();
  let matched = 0;
  for (const term of terms) {
    if (lowered.includes(term)) {
      matched += 1;
    }
  }

  return matched / terms.length;
}

function isLowSignalContent(content: string): boolean {
  const normalized = normalizeWhitespace(content);
  if (normalized.length < 80) {
    return true;
  }

  const alphaCharacters = normalized.replace(/[^a-zA-Z]/g, '').length;
  const alphaRatio = alphaCharacters / normalized.length;
  if (alphaRatio < 0.55) {
    return true;
  }

  return false;
}

function extractJsonObject(raw: string): ModelOutput {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const candidates = extractBalancedJsonObjectCandidates(cleaned);
  if (candidates.length === 0) {
    throw new Error('Model output did not include a JSON object');
  }

  let parseError: Error | null = null;
  for (const candidate of candidates) {
    try {
      const parsed = parseJsonWithRepairs(candidate);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        continue;
      }
      return parsed as ModelOutput;
    } catch (error) {
      parseError = error as Error;
    }
  }

  throw new Error(parseError?.message ?? 'Model output JSON root must be an object');
}

function extractBalancedJsonObjectCandidates(raw: string): string[] {
  const candidates: string[] = [];
  for (let start = 0; start < raw.length; start += 1) {
    if (raw[start] !== '{') {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index];
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          candidates.push(raw.slice(start, index + 1));
          break;
        }
      }
    }
  }

  return candidates.sort((a, b) => b.length - a.length);
}

function parseJsonWithRepairs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const repaired = raw
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ');
    return JSON.parse(repaired);
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
