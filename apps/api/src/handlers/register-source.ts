/**
 * POST /api/v1/sources
 *
 * Registers a new document source (URL) for ingestion into the knowledge base.
 * Upserts the Source row and queues it for crawl + chunk + embed via SQS.
 *
 * Restricted to admin users via the ADMIN_USER_IDS env var (comma-separated list).
 * If ADMIN_USER_IDS is not set, any authenticated user can register sources.
 */

import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { getIngestionQueue } from '../queue/ingestion-queue';

const SOURCE_TYPES = [
  'UNIVERSITY_EXTENSION',
  'MANUFACTURER',
  'RETAILER',
  'RESEARCH_PAPER',
  'GOVERNMENT',
] as const;

const RegisterSourceSchema = z.object({
  url: z.string().url().max(2000),
  title: z.string().trim().min(2).max(500),
  institution: z.string().trim().max(300).optional(),
  sourceType: z.enum(SOURCE_TYPES).default('UNIVERSITY_EXTENSION'),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  freshnessHours: z.number().int().min(1).max(8760).default(168), // 1 week default
  tags: z.array(z.string().trim().max(100)).max(20).default([]),
});

interface SourceRow {
  id: string;
  title: string;
  url: string | null;
  sourceType: string;
  institution: string | null;
  status: string;
  chunksCount: number;
  createdAt: Date;
  updatedAt: Date;
}

let sourcePool: Pool | null = null;

function getPool(): Pool {
  if (!sourcePool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    sourcePool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 6),
      ssl: resolvePoolSslConfig(),
    });
  }
  return sourcePool;
}

function isAdminUser(userId: string): boolean {
  const adminIds = process.env.ADMIN_USER_IDS;
  if (!adminIds) return true; // open if not configured
  return adminIds.split(',').map((id) => id.trim()).includes(userId);
}

export function buildRegisterSourceHandler(verifier?: AuthVerifier): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, context) => {
    // Admin guard
    const userId = (context as { userId?: string }).userId ?? '';
    if (!isAdminUser(userId)) {
      return jsonResponse(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { statusCode: 403 }
      );
    }

    let payload: z.infer<typeof RegisterSourceSchema>;
    try {
      payload = RegisterSourceSchema.parse(parseJsonBody<unknown>(event.body));
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

    const { url, title, institution, sourceType, priority, freshnessHours, tags } = payload;
    const pool = getPool();

    // Upsert Source row — reset status to 'pending' so the worker re-ingests it
    let source: SourceRow;
    try {
      const result = await pool.query<SourceRow>(
        `INSERT INTO "Source" (id, title, url, "sourceType", institution, status, "chunksCount", priority, "freshnessHours", tags, "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'pending', 0, $5, $6, $7::jsonb, now(), now())
         ON CONFLICT (url)
         DO UPDATE SET
           title           = EXCLUDED.title,
           institution     = EXCLUDED.institution,
           priority        = EXCLUDED.priority,
           "freshnessHours" = EXCLUDED."freshnessHours",
           tags            = EXCLUDED.tags,
           status          = 'pending',
           "updatedAt"     = now()
         RETURNING id, title, url, "sourceType", institution, status, "chunksCount", "createdAt", "updatedAt"`,
        [title, url, sourceType, institution ?? null, priority, freshnessHours, JSON.stringify(tags)]
      );
      source = result.rows[0];
    } catch (err) {
      console.error('[Sources] DB upsert failed:', (err as Error).message);
      return jsonResponse(
        { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to register source' } },
        { statusCode: 500 }
      );
    }

    // Queue for ingestion
    try {
      const queue = getIngestionQueue();
      await queue.publishIngestionBatch({
        messageType: 'ingestion.batch.requested',
        messageVersion: '1',
        requestedAt: new Date().toISOString(),
        sources: [
          {
            sourceId: source.id,
            url,
            priority,
            freshnessHours,
            tags,
          },
        ],
      });
    } catch (err) {
      // Queuing failure is non-fatal — source is registered in DB, worker can pick it up later
      console.warn('[Sources] Failed to queue ingestion batch:', (err as Error).message);
    }

    return jsonResponse(
      {
        source: {
          id: source.id,
          title: source.title,
          url: source.url,
          sourceType: source.sourceType,
          institution: source.institution,
          status: source.status,
          chunksCount: source.chunksCount,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
        },
        queued: true,
      },
      { statusCode: 201 }
    );
  }, verifier);
}

export const handler = buildRegisterSourceHandler();
