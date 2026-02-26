import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import { getUsageSnapshot } from '../lib/entitlements';
import { OVERAGE_RECOMMENDATION_PRICE_USD, SUBSCRIPTION_PLANS } from '../lib/subscription-plans';
import { DEFAULT_SUBSCRIPTION_TIER } from '../lib/subscription-plans';

interface PgErrorLike {
  code?: string;
}

function isMissingBillingSchema(error: unknown): boolean {
  const code = (error as PgErrorLike | null)?.code;
  return code === '42P01' || code === '42703' || code === '23503';
}

export function buildGetUsageHandler(verifier?: AuthVerifier): APIGatewayProxyHandlerV2 {
  return withAuth(async (_event, auth) => {
    try {
      const pool = getRuntimePool();
      const usage = await getUsageSnapshot(pool, auth.userId);

      return jsonResponse(
        {
          usage: {
            month: usage.month,
            usedRecommendations: usage.usedRecommendations,
            includedRecommendations: usage.includedRecommendations,
            remainingRecommendations: Math.max(
              0,
              usage.includedRecommendations - usage.usedRecommendations
            ),
            creditsBalanceUsd: usage.creditsBalanceUsd,
            overagePriceUsd: usage.overagePriceUsd,
          },
        },
        { statusCode: 200 }
      );
    } catch (error) {
      if (isMissingBillingSchema(error)) {
        const plan = SUBSCRIPTION_PLANS[DEFAULT_SUBSCRIPTION_TIER];
        return jsonResponse(
          {
            usage: {
              month: new Date().toISOString().slice(0, 7),
              usedRecommendations: 0,
              includedRecommendations: plan.includedRecommendations,
              remainingRecommendations: plan.includedRecommendations,
              creditsBalanceUsd: 0,
              overagePriceUsd: OVERAGE_RECOMMENDATION_PRICE_USD,
            },
            degraded: true,
          },
          { statusCode: 200 }
        );
      }

      console.error('Failed to get usage snapshot', {
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

export const handler = buildGetUsageHandler();
