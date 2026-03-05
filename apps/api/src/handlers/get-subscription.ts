import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import { getSubscriptionSnapshot, resolvePlanDisplay, tierIsPro } from '../lib/entitlements';
import { SUBSCRIPTION_PLANS } from '../lib/subscription-plans';
import { DEFAULT_SUBSCRIPTION_TIER } from '../lib/subscription-plans';

interface PgErrorLike {
  code?: string;
}

function isMissingBillingSchema(error: unknown): boolean {
  const code = (error as PgErrorLike | null)?.code;
  return code === '42P01' || code === '42703' || code === '23503';
}

export function buildGetSubscriptionHandler(verifier?: AuthVerifier): APIGatewayProxyHandlerV2 {
  return withAuth(async (_event, auth) => {
    try {
      const pool = getRuntimePool();
      const subscription = await getSubscriptionSnapshot(pool, auth.userId);
      const plan = SUBSCRIPTION_PLANS[subscription.planId];

      return jsonResponse(
        {
          subscription: {
            planId: subscription.planId,
            planName: resolvePlanDisplay(subscription.planId),
            status: subscription.status,
            isPro: tierIsPro(subscription.planId),
            includedRecommendations: plan.includedRecommendations,
            priceUsd: plan.priceUsd,
            currentPeriodStart: subscription.periodStart,
            currentPeriodEnd: subscription.periodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          },
        },
        { statusCode: 200 }
      );
    } catch (error) {
      if (isMissingBillingSchema(error)) {
        const fallbackPlan = SUBSCRIPTION_PLANS[DEFAULT_SUBSCRIPTION_TIER];
        const now = new Date();
        const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

        return jsonResponse(
          {
            subscription: {
              planId: fallbackPlan.id,
              planName: fallbackPlan.displayName,
              status: 'active',
              isPro: false,
              includedRecommendations: fallbackPlan.includedRecommendations,
              priceUsd: fallbackPlan.priceUsd,
              currentPeriodStart: periodStart.toISOString(),
              currentPeriodEnd: periodEnd.toISOString(),
              cancelAtPeriodEnd: false,
            },
            degraded: true,
          },
          { statusCode: 200 }
        );
      }

      console.error('Failed to get subscription', {
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

export const handler = buildGetSubscriptionHandler();
