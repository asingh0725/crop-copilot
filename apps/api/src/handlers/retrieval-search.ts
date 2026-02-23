/**
 * POST /api/v1/retrieval/search
 *
 * Runs a hybrid vector + lexical search over TextChunks and returns
 * ranked, scored candidates. Useful for debugging retrieval, building
 * admin tooling, and direct knowledge-base queries from the web app.
 */

import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { rankCandidates, type RankContext } from '../rag/hybrid-ranker';
import type { RetrievedCandidate, SourceAuthorityType } from '../rag/types';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const RetrievalSearchSchema = z.object({
  query: z.string().trim().min(2).max(2000),
  crop: z.string().trim().max(100).optional(),
  region: z.string().trim().max(200).optional(),
  topicHints: z.array(z.string().trim()).max(10).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  sourceTypes: z
    .array(
      z.enum([
        'GOVERNMENT',
        'UNIVERSITY_EXTENSION',
        'RESEARCH_PAPER',
        'MANUFACTURER',
        'RETAILER',
        'OTHER',
      ])
    )
    .optional(),
});

interface TextChunkRow {
  chunk_id: string;
  source_id: string;
  content: string;
  similarity: number;
  source_type: string;
  source_title: string;
  institution: string | null;
  source_boost: number;
  metadata: unknown;
}

let retrievalPool: Pool | null = null;

function getPool(): Pool {
  if (!retrievalPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    retrievalPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 6),
      ssl: resolvePoolSslConfig(),
    });
  }
  return retrievalPool;
}

async function createEmbedding(query: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: query }),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = payload.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) return null;

    const nums = embedding.map(Number);
    return nums.some((v) => !Number.isFinite(v)) ? null : nums;
  } catch {
    return null;
  }
}

async function retrieveVectorCandidates(
  pool: Pool,
  embedding: number[],
  cropTerm: string,
  limit: number,
  sourceTypes?: string[]
): Promise<TextChunkRow[]> {
  const vectorLiteral = `[${embedding.join(',')}]`;

  const typeFilter =
    sourceTypes && sourceTypes.length > 0
      ? `AND s."sourceType" = ANY($4::text[])`
      : '';
  const params: unknown[] = [vectorLiteral, cropTerm, limit];
  if (sourceTypes && sourceTypes.length > 0) params.push(sourceTypes);

  const result = await pool.query<TextChunkRow>(
    `SELECT
       t.id                                        AS chunk_id,
       t."sourceId"                               AS source_id,
       t.content,
       (1 - (t.embedding <=> $1::vector))::float8 AS similarity,
       s."sourceType"                             AS source_type,
       s.title                                    AS source_title,
       s.institution,
       COALESCE(sb.boost, 0)::float8              AS source_boost,
       t.metadata,
       (
         (1 - (t.embedding <=> $1::vector)) +
         CASE WHEN $2::text <> '' AND lower(t.content) LIKE '%' || lower($2) || '%' THEN 0.08 ELSE 0 END +
         COALESCE(sb.boost, 0)
       ) AS hybrid_score
     FROM "TextChunk" t
     JOIN "Source" s ON s.id = t."sourceId"
     LEFT JOIN "SourceBoost" sb ON sb."sourceId" = s.id
     WHERE t.embedding IS NOT NULL
       AND s.status IN ('ready', 'processed', 'completed')
       ${typeFilter}
     ORDER BY hybrid_score DESC
     LIMIT $3`,
    params
  );
  return result.rows;
}

async function retrieveLexicalCandidates(
  pool: Pool,
  query: string,
  cropTerm: string,
  limit: number,
  sourceTypes?: string[]
): Promise<TextChunkRow[]> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 8);
  if (terms.length === 0) return [];

  const likeConditions = terms.map((_, i) => `lower(t.content) LIKE '%' || $${i + 3} || '%'`);
  const likeScores = terms.map((_, i) => `(lower(t.content) LIKE '%' || $${i + 3} || '%')::int * 0.1`);
  const typeFilter =
    sourceTypes && sourceTypes.length > 0
      ? `AND s."sourceType" = ANY($${terms.length + 3}::text[])`
      : '';
  const params: unknown[] = [cropTerm, limit, ...terms];
  if (sourceTypes && sourceTypes.length > 0) params.push(sourceTypes);

  const result = await pool.query<TextChunkRow>(
    `SELECT
       t.id                                 AS chunk_id,
       t."sourceId"                        AS source_id,
       t.content,
       0.5::float8                          AS similarity,
       s."sourceType"                      AS source_type,
       s.title                             AS source_title,
       s.institution,
       COALESCE(sb.boost, 0)::float8       AS source_boost,
       t.metadata,
       (
         (${likeScores.join(' + ')}) +
         CASE WHEN $1::text <> '' AND lower(t.content) LIKE '%' || lower($1) || '%' THEN 0.08 ELSE 0 END +
         COALESCE(sb.boost, 0)
       ) AS hybrid_score
     FROM "TextChunk" t
     JOIN "Source" s ON s.id = t."sourceId"
     LEFT JOIN "SourceBoost" sb ON sb."sourceId" = s.id
     WHERE s.status IN ('ready', 'processed', 'completed')
       AND (${likeConditions.join(' OR ')})
       ${typeFilter}
     ORDER BY hybrid_score DESC
     LIMIT $2`,
    params
  );
  return result.rows;
}

function toRetrievedCandidate(row: TextChunkRow): RetrievedCandidate {
  const meta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  return {
    chunkId: row.chunk_id,
    sourceId: row.source_id,
    content: row.content,
    similarity: row.similarity,
    sourceType: (row.source_type as SourceAuthorityType) ?? 'OTHER',
    sourceTitle: row.source_title,
    metadata: {
      crops: Array.isArray(meta.crops) ? (meta.crops as string[]) : undefined,
      topics: Array.isArray(meta.topics) ? (meta.topics as string[]) : undefined,
      region: typeof meta.region === 'string' ? meta.region : undefined,
      position: typeof meta.chunkIndex === 'number' ? meta.chunkIndex : undefined,
    },
  };
}

export function buildRetrievalSearchHandler(verifier?: AuthVerifier): APIGatewayProxyHandlerV2 {
  return withAuth(async (event) => {
    let payload: z.infer<typeof RetrievalSearchSchema>;
    try {
      payload = RetrievalSearchSchema.parse(parseJsonBody<unknown>(event.body));
    } catch (error) {
      if (error instanceof z.ZodError || isBadRequestError(error)) {
        const message =
          error instanceof z.ZodError
            ? error.issues[0]?.message ?? error.message
            : (error as Error).message;
        return jsonResponse({ error: { code: 'BAD_REQUEST', message } }, { statusCode: 400 });
      }
      return jsonResponse(
        { error: { code: 'BAD_REQUEST', message: 'Invalid request payload' } },
        { statusCode: 400 }
      );
    }

    const { query, crop, region, topicHints, limit = DEFAULT_LIMIT, sourceTypes } = payload;
    const cropTerm = crop ?? '';
    const pool = getPool();

    // Generate embedding; fall back to lexical if OpenAI unavailable
    const embedding = await createEmbedding(query);

    let rawCandidates: TextChunkRow[];
    try {
      rawCandidates = embedding
        ? await retrieveVectorCandidates(pool, embedding, cropTerm, limit * 2, sourceTypes)
        : await retrieveLexicalCandidates(pool, query, cropTerm, limit * 2, sourceTypes);
    } catch (err) {
      console.error('[Retrieval] DB query failed:', (err as Error).message);
      return jsonResponse(
        { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Retrieval query failed' } },
        { statusCode: 500 }
      );
    }

    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const rankContext: RankContext = { queryTerms, crop, region, topicHints };
    const ranked = rankCandidates(rawCandidates.map(toRetrievedCandidate), rankContext)
      .slice(0, limit);

    return jsonResponse(
      {
        results: ranked.map((c) => ({
          chunkId: c.chunkId,
          sourceId: c.sourceId,
          content: c.content,
          relevanceScore: c.rankScore,
          scoreBreakdown: c.scoreBreakdown,
          sourceType: c.sourceType,
          sourceTitle: c.sourceTitle,
          metadata: c.metadata,
        })),
        meta: {
          query,
          total: ranked.length,
          embeddingUsed: embedding !== null,
        },
      },
      { statusCode: 200 }
    );
  }, verifier);
}

export const handler = buildRetrievalSearchHandler();
