import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import { getPremiumEnrichmentQueue } from '../queue/premium-enrichment-queue';
import { upsertPremiumInsight } from '../premium/premium-store';
import { DEFAULT_ADVISORY_NOTICE } from '../premium/types';

export function buildRefreshRecommendationPremiumHandler(
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

    try {
      const pool = getRuntimePool();
      const recommendationExists = await pool.query<{ id: string }>(
        `
          SELECT id
          FROM "Recommendation"
          WHERE id = $1
            AND "userId" = $2
          LIMIT 1
        `,
        [recommendationId, auth.userId]
      );

      if (recommendationExists.rows.length === 0) {
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

      await upsertPremiumInsight(pool, auth.userId, recommendationId, {
        status: 'queued',
        riskReview: null,
        complianceDecision: null,
        checks: [],
        costAnalysis: null,
        sprayWindows: [],
        advisoryNotice: DEFAULT_ADVISORY_NOTICE,
        report: null,
      });

      await getPremiumEnrichmentQueue().publishPremiumEnrichment({
        messageType: 'premium.enrichment.requested',
        messageVersion: '1',
        requestedAt: new Date().toISOString(),
        traceId: event.requestContext.requestId,
        userId: auth.userId,
        recommendationId,
      });

      return jsonResponse(
        {
          status: 'queued',
        },
        { statusCode: 202 }
      );
    } catch (error) {
      console.error('Failed to refresh premium recommendation payload', {
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

export const handler = buildRefreshRecommendationPremiumHandler();
