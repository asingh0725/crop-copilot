import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { searchLivePricing, type PricingOffer } from '../lib/pricing-search';

const PRICING_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — matches iOS client TTL

const ProductPricingBatchSchema = z.object({
  productIds: z.array(z.string().trim().min(1)).min(1).max(50),
  region: z.string().trim().min(1).max(200).optional(),
});

interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
}

interface PricingCacheRow {
  pricing: unknown;
  expiresAt: Date;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    pool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 6),
      ssl: resolvePoolSslConfig(),
    });
  }
  return pool;
}

function normalizeRegionKey(region: string): string {
  return region.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function getCachedPricing(
  db: Pool,
  productId: string,
  regionKey: string
): Promise<PricingOffer[] | null> {
  try {
    const result = await db.query<PricingCacheRow>(
      `SELECT pricing, "expiresAt" FROM "ProductPricingCache"
       WHERE "productId" = $1 AND region = $2`,
      [productId, regionKey]
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    if (new Date(row.expiresAt) <= new Date()) {
      db.query(
        `DELETE FROM "ProductPricingCache" WHERE "productId" = $1 AND region = $2`,
        [productId, regionKey]
      ).catch(() => undefined);
      return null;
    }

    const arr = Array.isArray(row.pricing) ? (row.pricing as PricingOffer[]) : null;
    return arr;
  } catch {
    return null;
  }
}

async function storeCachedPricing(
  db: Pool,
  productId: string,
  regionKey: string,
  offers: PricingOffer[]
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PRICING_CACHE_TTL_MS);
  try {
    await db.query(
      `INSERT INTO "ProductPricingCache" ("productId", region, pricing, "cachedAt", "expiresAt")
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT ("productId", region)
       DO UPDATE SET pricing = EXCLUDED.pricing, "cachedAt" = EXCLUDED."cachedAt", "expiresAt" = EXCLUDED."expiresAt"`,
      [productId, regionKey, JSON.stringify(offers), now, expiresAt]
    );
  } catch (err) {
    console.warn('[Pricing] Failed to store cache:', (err as Error).message);
  }
}

function buildPricingEntry(
  row: ProductRow,
  offers: PricingOffer[],
  region: string
) {
  const sorted = offers
    .filter((o) => o.price != null)
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));

  return {
    productId: row.id,
    productName: row.name,
    brand: row.brand,
    pricing: {
      currency: region.toLowerCase().includes('canada') ? 'CAD' : 'USD',
      retailPrice: sorted[0]?.price ?? null,
      wholesalePrice: sorted[1]?.price ?? null,
      unit: sorted[0]?.unit ?? null,
      availability: sorted.length > 0 ? `${sorted.length} retailer offer${sorted.length > 1 ? 's' : ''}` : null,
      lastUpdated: sorted[0]?.lastUpdated ?? null,
    },
    offers,
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
          error instanceof z.ZodError ? error.issues[0]?.message ?? error.message : (error as Error).message;
        return jsonResponse({ error: { code: 'BAD_REQUEST', message } }, { statusCode: 400 });
      }
      return jsonResponse(
        { error: { code: 'BAD_REQUEST', message: 'Invalid request payload' } },
        { statusCode: 400 }
      );
    }

    const productIds = Array.from(new Set(payload.productIds));
    const region = payload.region ?? process.env.DEFAULT_PRICING_REGION ?? 'United States';
    const regionKey = normalizeRegionKey(region);
    const db = getPool();

    // Fetch product metadata
    let products: ProductRow[] = [];
    try {
      const result = await db.query<ProductRow>(
        `SELECT id, name, brand FROM "Product" WHERE id = ANY($1::text[])`,
        [productIds]
      );
      products = result.rows;
    } catch (error) {
      console.warn('[Pricing] DB fetch failed, falling back to id-only pricing payload:', {
        error: (error as Error).message,
      });
      products = productIds.map((id) => ({
        id,
        name: id,
        brand: null,
      }));
    }

    if (products.length === 0) {
      products = productIds.map((id) => ({
        id,
        name: id,
        brand: null,
      }));
    }

    // For each product: check cache, live-search if needed
    const pricingEntries = await Promise.all(
      products.map(async (row) => {
        const cached = await getCachedPricing(db, row.id, regionKey);
        if (cached !== null) {
          console.log(`[Pricing] Cache hit for ${row.id} (${regionKey})`);
          return buildPricingEntry(row, cached, region);
        }

        console.log(`[Pricing] Live search for "${row.name}" in ${region}`);
        const offers = await searchLivePricing({
          productName: row.name,
          brand: row.brand,
          region,
          maxResults: 5,
        });

        if (offers.length > 0) {
          void storeCachedPricing(db, row.id, regionKey, offers);
        }

        return buildPricingEntry(row, offers, region);
      })
    );

    return jsonResponse(
      {
        pricing: pricingEntries,
        meta: {
          region,
          fetchedAt: new Date().toISOString(),
        },
      },
      { statusCode: 200 }
    );
  }, verifier);
}

export const handler = buildGetProductPricingBatchHandler();
