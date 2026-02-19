import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

type SortBy = 'name' | 'brand' | 'type' | 'createdAt';
type SortOrder = 'asc' | 'desc';

interface CountRow {
  total: number;
}

interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  type: string;
  analysis: unknown;
  application_rate: string | null;
  crops: string[] | null;
  description: string | null;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

let productsPool: Pool | null = null;

function getProductsPool(): Pool {
  if (!productsPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for products listing');
    }

    productsPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 6),
      ssl: resolvePoolSslConfig(),
    });
  }

  return productsPool;
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

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function parseSortBy(raw: string | undefined): SortBy {
  if (raw === 'name' || raw === 'brand' || raw === 'type' || raw === 'createdAt') {
    return raw;
  }

  return 'name';
}

function parseSortOrder(raw: string | undefined): SortOrder {
  if (raw === 'desc') {
    return raw;
  }

  return 'asc';
}

function resolveSortColumn(sortBy: SortBy): string {
  switch (sortBy) {
    case 'brand':
      return 'p.brand';
    case 'type':
      return 'p.type';
    case 'createdAt':
      return 'p."createdAt"';
    case 'name':
    default:
      return 'p.name';
  }
}

export function buildListProductsHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event) => {
    const query = event.queryStringParameters ?? {};
    const search = query.search?.trim();
    const crop = query.crop?.trim();
    const limit = Math.min(Math.max(parsePositiveInt(query.limit, 20), 1), 100);
    const offset = Math.max(parsePositiveInt(query.offset, 0), 0);
    const sortBy = parseSortBy(query.sortBy);
    const sortOrder = parseSortOrder(query.sortOrder);
    const types = (query.types ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      const searchParam = `$${params.length}`;
      whereClauses.push(
        `(p.name ILIKE ${searchParam} OR COALESCE(p.brand, '') ILIKE ${searchParam} OR COALESCE(p.description, '') ILIKE ${searchParam})`
      );
    }

    if (types.length > 0) {
      params.push(types);
      whereClauses.push(`p.type::text = ANY($${params.length}::text[])`);
    }

    if (crop) {
      params.push(crop);
      whereClauses.push(
        `EXISTS (SELECT 1 FROM unnest(p.crops) AS crop_name WHERE lower(crop_name) = lower($${params.length}))`
      );
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const orderColumn = resolveSortColumn(sortBy);
    const orderDirection = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const pool = getProductsPool();

    try {
      const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM "Product" p
        ${whereSql}
      `;
      const limitParamPosition = params.length + 1;
      const offsetParamPosition = params.length + 2;
      const listQuery = `
        SELECT
          p.id,
          p.name,
          p.brand,
          p.type::text AS type,
          p.analysis,
          p."applicationRate" AS application_rate,
          p.crops,
          p.description,
          p.metadata,
          p."createdAt" AS created_at,
          p."updatedAt" AS updated_at
        FROM "Product" p
        ${whereSql}
        ORDER BY ${orderColumn} ${orderDirection}, p.id ASC
        LIMIT $${limitParamPosition}
        OFFSET $${offsetParamPosition}
      `;

      const [countResult, listResult] = await Promise.all([
        pool.query<CountRow>(countQuery, params),
        pool.query<ProductRow>(listQuery, [...params, limit, offset]),
      ]);

      const total = Number(countResult.rows[0]?.total ?? 0);
      const products = listResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        brand: row.brand,
        type: row.type,
        analysis: row.analysis,
        applicationRate: row.application_rate,
        crops: row.crops ?? [],
        description: row.description,
        metadata: row.metadata,
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at),
      }));

      return jsonResponse(
        {
          products,
          total,
          limit,
          offset,
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('Failed to list products', {
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

export const handler = buildListProductsHandler();
