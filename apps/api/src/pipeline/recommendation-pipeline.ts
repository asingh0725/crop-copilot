import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { CreateInputCommand, RecommendationResult } from '@crop-copilot/contracts';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { rankCandidates } from '../rag/hybrid-ranker';
import { expandRetrievalQuery, type QueryExpansionResult } from '../rag/query-expansion';
import type { RankedCandidate, RetrievedCandidate, SourceAuthorityType } from '../rag/types';

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
    dependencies.generateModelOutput ?? generateModelOutputFromAnthropic;

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

  const candidates = await retrieveCandidates(inputSnapshot, queryExpansion);
  const ranked = rankCandidates(candidates, {
    queryTerms: queryExpansion.terms,
    crop: inputSnapshot.crop,
    region: inputSnapshot.location,
  });
  const topCandidates = ranked.slice(0, MAX_CONTEXT_CANDIDATES);

  let modelResult: ModelGenerationResult | null = null;
  try {
    modelResult = await generateModelOutput({
      input: inputSnapshot,
      candidates: topCandidates,
      queryExpansion,
    });
  } catch (error) {
    console.error('Model generation failed, falling back to heuristic output', {
      inputId: input.inputId,
      userId: input.userId,
      error: (error as Error).message,
    });
  }

  const fallback = buildHeuristicOutput(inputSnapshot, topCandidates);
  const normalized = normalizeOutput(
    modelResult?.output ?? fallback,
    fallback,
    topCandidates
  );

  const citedChunkIds = collectCitations(normalized.recommendations, topCandidates);
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
    confidence: normalized.confidence,
    diagnosis: {
      diagnosis: normalized.diagnosis,
      recommendations: normalized.recommendations,
      products: normalized.products,
      confidence: normalized.confidence,
      generatedAt: timestamp,
      inputId: input.inputId,
      userId: input.userId,
      jobId: input.jobId,
      retrievalQuery: queryExpansion.expandedQuery,
    },
    sources,
    modelUsed: modelResult?.model ?? 'heuristic-rag-v1',
  };
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
  if (!embedding) {
    return retrieveCandidatesLexical(pool, input, expansion, limit);
  }

  const vectorLiteral = `[${embedding.join(',')}]`;
  const cropTerm = input.crop ?? '';
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
      ORDER BY hybrid_score DESC
      LIMIT $3
    `,
    [vectorLiteral, cropTerm, limit]
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
  const cropTerm = input.crop?.toLowerCase() ?? '';
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
      ORDER BY t."createdAt" DESC
      LIMIT $2
    `,
    [patterns, limit * 5]
  );

  return rows.rows
    .map((row) => {
      const content = normalizeWhitespace(row.content);
      const lexicalScore = scoreLexicalMatch(content, terms);
      const cropBoost =
        cropTerm.length > 0 &&
        (content.toLowerCase().includes(cropTerm) ||
          row.source_title.toLowerCase().includes(cropTerm) ||
          JSON.stringify(row.metadata ?? {}).toLowerCase().includes(cropTerm))
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
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: query,
      }),
    });

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
  params: ModelGenerationInput
): Promise<ModelGenerationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  if (!apiKey && !authToken) {
    return null;
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5-20250929';
  const systemPrompt =
    'You are an expert agronomy advisor. Use only supplied evidence chunks. Return strictly valid JSON only.';
  const prompt = buildModelPrompt(params);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };

  if (apiKey) {
    headers['x-api-key'] = apiKey;
  } else if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
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
  });

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
    '- If uncertainty is high, set conditionType to unknown and explain diagnostic next steps.',
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

function buildHeuristicOutput(
  input: InputSnapshot,
  candidates: RankedCandidate[]
): ModelOutput {
  const summaryText = [
    input.description?.toLowerCase() ?? '',
    JSON.stringify(input.labData ?? {}).toLowerCase(),
  ].join(' ');

  const { condition, conditionType } = inferCondition(summaryText);
  const confidence = clamp(
    candidates.length > 0
      ? 0.62 + Math.min(0.25, candidates[0].rankScore * 0.2)
      : 0.58,
    0.5,
    0.9
  );

  const citationIds = candidates.slice(0, 2).map((candidate) => candidate.chunkId);
  const evidenceSummary =
    candidates.length > 0
      ? candidates
          .slice(0, 2)
          .map((candidate) => `${candidate.sourceTitle} (${candidate.sourceType})`)
          .join('; ')
      : 'limited retrieved context';

  return {
    diagnosis: {
      condition,
      conditionType,
      confidence,
      reasoning: `Heuristic diagnosis from submitted symptoms with supporting context from ${evidenceSummary}.`,
    },
    recommendations: [
      {
        action:
          conditionType === 'deficiency'
            ? 'Collect tissue and soil samples before corrective application.'
            : 'Scout additional zones and confirm spread pattern before treatment.',
        priority: 'immediate',
        timing: 'Within 24-48 hours',
        details:
          'Validate field variability and confirm diagnosis using representative samples from affected and healthy areas.',
        citations: citationIds,
      },
      {
        action: 'Track progression and weather-driven risk over the next few days.',
        priority: 'soon',
        timing: 'Next 3-5 days',
        details:
          'Monitor severity changes to determine whether intervention thresholds are reached.',
        citations: citationIds.slice(0, 1),
      },
    ],
    products: [],
    confidence,
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

  const diagnosisConfidence = clamp(
    Number(model.diagnosis?.confidence ?? model.confidence ?? fallbackDiagnosis.confidence),
    0.5,
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
    .slice(0, 4);

  return {
    diagnosis: {
      condition: diagnosisCondition,
      conditionType: diagnosisType,
      confidence: diagnosisConfidence,
      reasoning,
    },
    recommendations,
    products,
    confidence: diagnosisConfidence,
  };
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
        params.recommendationId,
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
  if (/(chlorosis|deficien|nutrient|yellowing between veins|interveinal)/.test(text)) {
    return {
      condition: 'probable_nutrient_deficiency_or_root_stress',
      conditionType: 'deficiency',
    };
  }
  if (/(aphid|insect|mite|worm|beetle|larva|pest)/.test(text)) {
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
  if (/(lesion|blight|rot|mold|fung|bacter|viral|disease)/.test(text)) {
    return {
      condition: 'probable_foliar_disease',
      conditionType: 'disease',
    };
  }
  return {
    condition: 'uncertain_field_issue',
    conditionType: 'unknown',
  };
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
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Model output did not include a JSON object');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Model output JSON root must be an object');
  }

  return parsed as ModelOutput;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
