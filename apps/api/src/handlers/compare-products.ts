import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

const CompareProductsSchema = z.object({
  productIds: z.array(z.string().trim().min(1)).min(2).max(6),
});

interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  type: string;
  analysis: unknown;
  application_rate: string | null;
  crops: string[] | null;
  description: string | null;
}

let compareProductsPool: Pool | null = null;

function getCompareProductsPool(): Pool {
  if (!compareProductsPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for product comparison');
    }

    compareProductsPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: 4,
      ssl: resolvePoolSslConfig(),
    });
  }

  return compareProductsPool;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function buildCompareProductsHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event) => {
    let payload: z.infer<typeof CompareProductsSchema>;
    try {
      payload = CompareProductsSchema.parse(parseJsonBody<unknown>(event.body));
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

    const ids = uniqueStrings(payload.productIds);
    if (ids.length < 2 || ids.length > 6) {
      return jsonResponse(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Please provide between 2 and 6 unique product IDs to compare',
          },
        },
        { statusCode: 400 }
      );
    }

    const pool = getCompareProductsPool();

    try {
      const result = await pool.query<ProductRow>(
        `
          SELECT
            p.id,
            p.name,
            p.brand,
            p.type::text AS type,
            p.analysis,
            p."applicationRate" AS application_rate,
            p.crops,
            p.description
          FROM "Product" p
          WHERE p.id = ANY($1::text[])
        `,
        [ids]
      );

      if (result.rows.length !== ids.length) {
        return jsonResponse(
          {
            error: {
              code: 'BAD_REQUEST',
              message: 'One or more products not found',
            },
          },
          { statusCode: 400 }
        );
      }

      const ordered = ids
        .map((id) => result.rows.find((row) => row.id === id))
        .filter((row): row is ProductRow => Boolean(row));

      const products = ordered.map((row) => ({
        id: row.id,
        name: row.name,
        brand: row.brand,
        type: row.type,
        analysis: row.analysis,
        applicationRate: row.application_rate,
        crops: row.crops ?? [],
        description: row.description,
      }));

      const cropSets = products.map((product) => new Set(product.crops));
      const commonCrops = (products[0]?.crops ?? []).filter((crop) =>
        cropSets.every((set) => set.has(crop))
      );

      const productsWithCompatibility = products.map((product) => {
        const otherCrops = new Set(
          products.filter((item) => item.id !== product.id).flatMap((item) => item.crops)
        );
        const uniqueCrops = product.crops.filter((crop) => !otherCrops.has(crop));

        return {
          ...product,
          compatibility: {
            allCrops: product.crops,
            uniqueCrops,
            commonCrops,
          },
        };
      });

      return jsonResponse(
        {
          products: productsWithCompatibility,
          comparison: {
            types: uniqueStrings(products.map((product) => product.type)),
            commonCrops,
            productCount: products.length,
          },
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('Failed to compare products', {
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

export const handler = buildCompareProductsHandler();
