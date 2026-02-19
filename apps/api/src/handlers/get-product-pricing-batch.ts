import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

const ProductPricingBatchSchema = z.object({
  productIds: z.array(z.string().trim().min(1)).min(1).max(50),
});

interface ProductPricingRow {
  id: string;
  name: string;
  brand: string | null;
  metadata: unknown;
}

let productPricingPool: Pool | null = null;

function getProductPricingPool(): Pool {
  if (!productPricingPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for product pricing');
    }

    productPricingPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 6),
      ssl: resolvePoolSslConfig(),
    });
  }

  return productPricingPool;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readPricingFromMetadata(metadata: unknown): {
  currency: string;
  retailPrice: number | null;
  wholesalePrice: number | null;
  unit: string | null;
  availability: string | null;
  lastUpdated: string | null;
} {
  const record = asRecord(metadata);
  const pricing = asRecord(record?.pricing);
  return {
    currency: asNullableString(pricing?.currency) ?? 'USD',
    retailPrice: asNullableNumber(pricing?.retailPrice),
    wholesalePrice: asNullableNumber(pricing?.wholesalePrice),
    unit: asNullableString(pricing?.unit),
    availability: asNullableString(pricing?.availability),
    lastUpdated: asNullableString(pricing?.lastUpdated),
  };
}

export function buildGetProductPricingBatchHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event) => {
    let payload: z.infer<typeof ProductPricingBatchSchema>;
    try {
      payload = ProductPricingBatchSchema.parse(parseJsonBody<unknown>(event.body));
    } catch (error) {
      if (error instanceof z.ZodError || isBadRequestError(error)) {
        const message =
          error instanceof z.ZodError ? error.issues[0]?.message ?? error.message : error.message;
        return jsonResponse(
          {
            error: {
              code: 'BAD_REQUEST',
              message,
            },
          },
          { statusCode: 400 }
        );
      }

      return jsonResponse(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Invalid request payload',
          },
        },
        { statusCode: 400 }
      );
    }

    const productIds = Array.from(new Set(payload.productIds));
    const pool = getProductPricingPool();

    try {
      const result = await pool.query<ProductPricingRow>(
        `
          SELECT
            p.id,
            p.name,
            p.brand,
            p.metadata
          FROM "Product" p
          WHERE p.id = ANY($1::text[])
        `,
        [productIds]
      );

      return jsonResponse(
        {
          pricing: result.rows.map((row) => ({
            productId: row.id,
            productName: row.name,
            brand: row.brand,
            pricing: readPricingFromMetadata(row.metadata),
          })),
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('Failed to fetch product pricing batch', {
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

export const handler = buildGetProductPricingBatchHandler();
