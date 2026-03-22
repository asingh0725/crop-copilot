import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import { getPremiumInsight, upsertPremiumInsight } from '../premium/premium-store';
import { getSubscriptionSnapshot, tierIsPro } from '../lib/entitlements';
import { DEFAULT_ADVISORY_NOTICE } from '../premium/types';
import { getPremiumEnrichmentQueue } from '../queue/premium-enrichment-queue';

async function queuePremiumRefresh(args: {
  userId: string;
  recommendationId: string;
  requestId: string;
}): Promise<void> {
  const pool = getRuntimePool();

  await getPremiumEnrichmentQueue().publishPremiumEnrichment({
    messageType: 'premium.enrichment.requested',
    messageVersion: '1',
    requestedAt: new Date().toISOString(),
    traceId: args.requestId,
    userId: args.userId,
    recommendationId: args.recommendationId,
  });

  await upsertPremiumInsight(pool, args.userId, args.recommendationId, {
    status: 'queued',
    riskReview: null,
    complianceDecision: null,
    checks: [],
    costAnalysis: null,
    sprayWindows: [],
    advisoryNotice: DEFAULT_ADVISORY_NOTICE,
    report: null,
  });
}

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
      const subscription = await getSubscriptionSnapshot(pool, auth.userId);
      const isPremiumEligible =
        (subscription.status === 'active' || subscription.status === 'trialing') &&
        tierIsPro(subscription.planId);
      const insight = await getPremiumInsight(pool, recommendationId, auth.userId);

      if (insight && !(isPremiumEligible && insight.status === 'not_available')) {
        return jsonResponse({ premium: insight }, { statusCode: 200 });
      }

      if (isPremiumEligible) {
        try {
          await queuePremiumRefresh({
            userId: auth.userId,
            recommendationId,
            requestId: event.requestContext.requestId,
          });
        } catch (error) {
          console.warn('Failed to enqueue premium enrichment from premium endpoint', {
            recommendationId,
            userId: auth.userId,
            error: (error as Error).message,
          });
        }

        return jsonResponse(
          {
            premium: {
              status: 'queued',
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
      }

      return jsonResponse(
        {
          premium: {
            status: 'not_available',
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
