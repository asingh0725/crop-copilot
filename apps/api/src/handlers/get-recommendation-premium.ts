import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import { getPremiumInsight } from '../premium/premium-store';
import { getSubscriptionSnapshot, tierIsPro } from '../lib/entitlements';
import { DEFAULT_ADVISORY_NOTICE } from '../premium/types';

export function buildGetRecommendationPremiumHandler(
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
      const insight = await getPremiumInsight(pool, recommendationId, auth.userId);
      if (insight) {
        return jsonResponse({ premium: insight }, { statusCode: 200 });
      }

      const subscription = await getSubscriptionSnapshot(pool, auth.userId);
      const fallbackStatus = tierIsPro(subscription.planId) ? 'queued' : 'not_available';

      return jsonResponse(
        {
          premium: {
            status: fallbackStatus,
            riskReview: null,
            complianceDecision: null,
            checks: [],
            costAnalysis: null,
            sprayWindows: [],
            advisoryNotice: DEFAULT_ADVISORY_NOTICE,
            report: null,
          },
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('Failed to fetch premium recommendation payload', {
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

export const handler = buildGetRecommendationPremiumHandler();
