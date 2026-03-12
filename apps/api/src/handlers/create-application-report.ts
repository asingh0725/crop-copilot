import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import { getPremiumInsight } from '../premium/premium-store';

export function buildCreateApplicationReportHandler(
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
      const premium = await getPremiumInsight(pool, recommendationId, auth.userId);

      if (!premium) {
        return jsonResponse(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Application prep packet not found',
            },
          },
          { statusCode: 404 }
        );
      }

      if (premium.status !== 'ready' || !premium.report) {
        return jsonResponse(
          {
            status: premium.status,
            message: 'Application prep packet is not ready yet',
          },
          { statusCode: 202 }
        );
      }

      return jsonResponse(
        {
          report: premium.report,
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('Failed to fetch application report', {
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

export const handler = buildCreateApplicationReportHandler();
