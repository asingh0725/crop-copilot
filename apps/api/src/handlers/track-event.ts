/**
 * POST /api/v1/events
 *
 * Records implicit user feedback events that supplement explicit ratings.
 * Events are lightweight — they just land in UserEvent and are rolled up
 * nightly into synthetic feedback signals for the LTR model.
 *
 * Supported event types:
 *   recommendation_viewed  — user opened a recommendation detail page
 *   product_clicked        — user tapped through to a product from a recommendation
 *   rediagnosed            — user submitted a new diagnosis within 7 days of a recommendation
 *                           (implicit signal the previous recommendation did not resolve the issue)
 *
 * All event types accept an optional `durationMs` payload field.
 */

import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { processImplicitSignal } from '../learning/feedback-learning';

const ALLOWED_TYPES = ['recommendation_viewed', 'product_clicked', 'rediagnosed'] as const;
type EventType = (typeof ALLOWED_TYPES)[number];

const TrackEventSchema = z.object({
  type: z.enum(ALLOWED_TYPES),
  recommendationId: z.string().uuid().optional(),
  productId: z.string().optional(),
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

let eventPool: Pool | null = null;

function getPool(): Pool {
  if (!eventPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    eventPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 5),
      ssl: resolvePoolSslConfig(),
    });
  }
  return eventPool;
}

export function buildTrackEventHandler(verifier?: AuthVerifier): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, context) => {
    const userId = (context as { userId?: string }).userId ?? '';

    let payload: z.infer<typeof TrackEventSchema>;
    try {
      payload = TrackEventSchema.parse(parseJsonBody<unknown>(event.body));
    } catch (error) {
      if (error instanceof z.ZodError || isBadRequestError(error)) {
        const message =
          error instanceof z.ZodError
            ? (error.issues[0]?.message ?? error.message)
            : (error as Error).message;
        return jsonResponse({ error: { code: 'BAD_REQUEST', message } }, { statusCode: 400 });
      }
      return jsonResponse(
        { error: { code: 'BAD_REQUEST', message: 'Invalid request payload' } },
        { statusCode: 400 },
      );
    }

    const pool = getPool();
    const eventPayload = {
      recommendationId: payload.recommendationId,
      productId: payload.productId,
      durationMs: payload.durationMs,
      ...payload.metadata,
    };

    try {
      await pool.query(
        `INSERT INTO "UserEvent" (id, "userId", type, payload, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3::jsonb, NOW())`,
        [userId, payload.type, JSON.stringify(eventPayload)],
      );
    } catch (err) {
      console.error('[TrackEvent] DB insert failed:', (err as Error).message);
      // Non-fatal — analytics events should never block the client
    }

    // Process implicit learning signal for events tied to a recommendation
    if (payload.recommendationId) {
      try {
        await processImplicitSignal(pool, {
          userId,
          recommendationId: payload.recommendationId,
          eventType: payload.type,
          durationMs: payload.durationMs,
        });
      } catch (err) {
        console.warn('[TrackEvent] Implicit signal processing failed:', (err as Error).message);
      }
    }

    return jsonResponse({ ok: true }, { statusCode: 200 });
  }, verifier);
}

export const handler = buildTrackEventHandler();
