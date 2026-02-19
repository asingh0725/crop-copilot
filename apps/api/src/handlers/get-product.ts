import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

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

interface RelatedProductRow {
  id: string;
  name: string;
  brand: string | null;
  type: string;
  analysis: unknown;
  crops: string[] | null;
}

interface ProductRecommendationRefRow {
  recommendation_id: string;
  condition: string;
  crop: string | null;
  created_at: Date | string;
}

interface RecommendationCountRow {
  total: number;
}

let productDetailPool: Pool | null = null;

function getProductDetailPool(): Pool {
  if (!productDetailPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for product details');
    }

    productDetailPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 6),
      ssl: resolvePoolSslConfig(),
    });
  }

  return productDetailPool;
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

export function buildGetProductHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    const productId = event.pathParameters?.id;
    if (!productId) {
      return jsonResponse(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Product id is required',
          },
        },
        { statusCode: 400 }
      );
    }

    const pool = getProductDetailPool();

    try {
      const productResult = await pool.query<ProductRow>(
        `
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
          WHERE p.id = $1
          LIMIT 1
        `,
        [productId]
      );

      if (productResult.rows.length === 0) {
        return jsonResponse(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Product not found',
            },
          },
          { statusCode: 404 }
        );
      }

      const product = productResult.rows[0];
      const [
        relatedResult,
        recommendationResult,
        diagnosisRecommendationResult,
        countResult,
      ] = await Promise.all([
        pool.query<RelatedProductRow>(
          `
            SELECT
              p.id,
              p.name,
              p.brand,
              p.type::text AS type,
              p.analysis,
              p.crops
            FROM "Product" p
            WHERE p.type = $1::"ProductType"
              AND p.id <> $2
            ORDER BY p."updatedAt" DESC
            LIMIT 4
          `,
          [product.type, productId]
        ),
        pool.query<ProductRecommendationRefRow>(
          `
            SELECT
              pr."recommendationId" AS recommendation_id,
              COALESCE(
                r.diagnosis->'diagnosis'->>'condition',
                r.diagnosis->>'condition',
                'Recommendation'
              ) AS condition,
              i.crop,
              r."createdAt" AS created_at
            FROM "ProductRecommendation" pr
            JOIN "Recommendation" r ON r.id = pr."recommendationId"
            JOIN "Input" i ON i.id = r."inputId"
            WHERE pr."productId" = $1
              AND r."userId" = $2
            ORDER BY r."createdAt" DESC
            LIMIT 8
          `,
          [productId, auth.userId]
        ),
        pool.query<ProductRecommendationRefRow>(
          `
            SELECT DISTINCT
              r.id AS recommendation_id,
              COALESCE(
                r.diagnosis->'diagnosis'->>'condition',
                r.diagnosis->>'condition',
                'Recommendation'
              ) AS condition,
              i.crop,
              r."createdAt" AS created_at
            FROM "Recommendation" r
            JOIN "Input" i ON i.id = r."inputId"
            JOIN LATERAL (
              SELECT elem
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(r.diagnosis->'products') = 'array'
                    THEN r.diagnosis->'products'
                  WHEN jsonb_typeof(r.diagnosis->'diagnosis'->'products') = 'array'
                    THEN r.diagnosis->'diagnosis'->'products'
                  ELSE '[]'::jsonb
                END
              ) AS product_elem(elem)
            ) AS candidate_products ON TRUE
            WHERE r."userId" = $2
              AND (
                COALESCE(
                  candidate_products.elem->>'productId',
                  candidate_products.elem->>'product_id',
                  candidate_products.elem->>'id'
                ) = $1
                OR lower(
                  COALESCE(
                    candidate_products.elem->>'productName',
                    candidate_products.elem->>'product_name',
                    candidate_products.elem->>'name',
                    ''
                  )
                ) = lower($3)
              )
            ORDER BY r."createdAt" DESC
            LIMIT 8
          `,
          [productId, auth.userId, product.name]
        ),
        pool.query<RecommendationCountRow>(
          `
            SELECT COUNT(*)::int AS total
            FROM "ProductRecommendation" pr
            JOIN "Recommendation" r ON r.id = pr."recommendationId"
            WHERE pr."productId" = $1
              AND r."userId" = $2
          `,
          [productId, auth.userId]
        ),
      ]);

      const recommendationMap = new Map<string, ProductRecommendationRefRow>();
      for (const row of recommendationResult.rows) {
        recommendationMap.set(row.recommendation_id, row);
      }
      for (const row of diagnosisRecommendationResult.rows) {
        if (!recommendationMap.has(row.recommendation_id)) {
          recommendationMap.set(row.recommendation_id, row);
        }
      }
      const mergedRecommendations = Array.from(recommendationMap.values())
        .sort((left, right) => {
          const leftTime = new Date(left.created_at).getTime();
          const rightTime = new Date(right.created_at).getTime();
          return rightTime - leftTime;
        })
        .slice(0, 8);
      const dbCount = Number(countResult.rows[0]?.total ?? 0);

      return jsonResponse(
        {
          id: product.id,
          name: product.name,
          brand: product.brand,
          type: product.type,
          analysis: product.analysis,
          applicationRate: product.application_rate,
          crops: product.crops ?? [],
          description: product.description,
          metadata: product.metadata,
          createdAt: toIsoString(product.created_at),
          updatedAt: toIsoString(product.updated_at),
          relatedProducts: relatedResult.rows.map((related) => ({
            id: related.id,
            name: related.name,
            brand: related.brand,
            type: related.type,
            analysis: related.analysis,
            crops: related.crops ?? [],
          })),
          usedInRecommendations: Math.max(dbCount, mergedRecommendations.length),
          recommendations: mergedRecommendations.map((entry) => ({
            recommendationId: entry.recommendation_id,
            condition: entry.condition,
            crop: entry.crop,
            createdAt: toIsoString(entry.created_at),
          })),
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('Failed to fetch product details', {
        productId,
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

export const handler = buildGetProductHandler();
