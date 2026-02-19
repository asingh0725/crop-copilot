import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

type SortOption = 'date_asc' | 'date_desc' | 'confidence_high' | 'confidence_low';

interface CountRow {
  total: number;
}

interface RecommendationListRow {
  id: string;
  created_at: Date | string;
  confidence: number;
  condition: string | null;
  condition_type: string | null;
  first_action: string | null;
  input_id: string;
  input_type: string;
  input_crop: string | null;
  input_location: string | null;
  input_image_url: string | null;
}

let recommendationsPool: Pool | null = null;

function getRecommendationsPool(): Pool {
  if (!recommendationsPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for recommendations listing');
    }

    recommendationsPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 6),
      ssl: resolvePoolSslConfig(),
    });
  }

  return recommendationsPool;
}

function inferConditionType(conditionType: string | null, condition: string): string {
  if (
    conditionType === 'deficiency' ||
    conditionType === 'disease' ||
    conditionType === 'pest' ||
    conditionType === 'environmental' ||
    conditionType === 'unknown'
  ) {
    return conditionType;
  }

  const lowered = condition.toLowerCase();
  if (/(deficien|chlorosis|nutrient)/.test(lowered)) return 'deficiency';
  if (/(pest|insect|mite|aphid|worm|beetle|bug)/.test(lowered)) return 'pest';
  if (/(drought|heat|cold|frost|water|environment)/.test(lowered)) return 'environmental';
  if (/(disease|blight|rust|mold|fung|bacter|viral|pathogen)/.test(lowered)) return 'disease';
  return 'unknown';
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseSort(raw: string | undefined): SortOption {
  if (
    raw === 'date_asc' ||
    raw === 'date_desc' ||
    raw === 'confidence_high' ||
    raw === 'confidence_low'
  ) {
    return raw;
  }

  return 'date_desc';
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

function resolveSortClause(sort: SortOption): string {
  switch (sort) {
    case 'date_asc':
      return 'r."createdAt" ASC';
    case 'confidence_high':
      return 'r.confidence DESC';
    case 'confidence_low':
      return 'r.confidence ASC';
    case 'date_desc':
    default:
      return 'r."createdAt" DESC';
  }
}

function buildSearchClause(search: string | undefined): {
  clause: string;
  params: unknown[];
} {
  if (!search) {
    return {
      clause: '',
      params: [],
    };
  }

  return {
    clause:
      'AND (COALESCE(i.crop, \'\') ILIKE $2 OR COALESCE(r.diagnosis->\'diagnosis\'->>\'condition\', r.diagnosis->>\'condition\', \'\') ILIKE $2)',
    params: [`%${search}%`],
  };
}

export function buildListRecommendationsHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    const query = event.queryStringParameters ?? {};
    const search = query.search?.trim() || undefined;
    const sort = parseSort(query.sort);
    const page = parsePositiveInt(query.page, 1);
    const pageSize = Math.min(parsePositiveInt(query.pageSize, 20), 100);
    const offset = (page - 1) * pageSize;

    const pool = getRecommendationsPool();
    const searchFilter = buildSearchClause(search);
    const baseParams: unknown[] = [auth.userId, ...searchFilter.params];
    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM "Recommendation" r
      JOIN "Input" i ON i.id = r."inputId"
      WHERE r."userId" = $1
      ${searchFilter.clause}
    `;
    const sortClause = resolveSortClause(sort);
    const pageParamPosition = baseParams.length + 1;
    const pageSizeParamPosition = baseParams.length + 2;
    const listQuery = `
      SELECT
        r.id,
        r."createdAt" AS created_at,
        r.confidence,
        COALESCE(
          r.diagnosis->'diagnosis'->>'condition',
          r.diagnosis->>'condition',
          'Unknown'
        ) AS condition,
        COALESCE(
          r.diagnosis->'diagnosis'->>'conditionType',
          r.diagnosis->>'conditionType'
        ) AS condition_type,
        r.diagnosis->'recommendations'->0->>'action' AS first_action,
        i.id AS input_id,
        i.type AS input_type,
        i.crop AS input_crop,
        i.location AS input_location,
        i."imageUrl" AS input_image_url
      FROM "Recommendation" r
      JOIN "Input" i ON i.id = r."inputId"
      WHERE r."userId" = $1
      ${searchFilter.clause}
      ORDER BY ${sortClause}
      OFFSET $${pageParamPosition}
      LIMIT $${pageSizeParamPosition}
    `;

    try {
      const [countResult, listResult] = await Promise.all([
        pool.query<CountRow>(countQuery, baseParams),
        pool.query<RecommendationListRow>(listQuery, [...baseParams, offset, pageSize]),
      ]);

      const total = Number(countResult.rows[0]?.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const recommendations = listResult.rows.map((row) => {
        const condition = row.condition ?? 'Unknown';
        return {
          id: row.id,
          createdAt: toIsoString(row.created_at),
          confidence: row.confidence,
          condition,
          conditionType: inferConditionType(row.condition_type, condition),
          firstAction: row.first_action,
          input: {
            id: row.input_id,
            type: row.input_type,
            crop: row.input_crop,
            location: row.input_location,
            imageUrl: row.input_image_url,
          },
        };
      });

      return jsonResponse(
        {
          recommendations,
          pagination: {
            page,
            pageSize,
            total,
            totalPages,
          },
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('Failed to list recommendations', {
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

export const handler = buildListRecommendationsHandler();
