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

let recommendationDetailPool: Pool | null = null;

function getRecommendationDetailPool(): Pool {
  if (!recommendationDetailPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for recommendation details');
    }

    recommendationDetailPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: 4,
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
`;

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
      const sourcesResult = await pool.query<RecommendationSourceRow>(
        recommendationSourcesQuery,
        [recommendation.id]
      );

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

      return jsonResponse(
        {
          id: recommendation.id,
          createdAt: toIsoString(recommendation.created_at),
          diagnosis: recommendation.diagnosis,
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
