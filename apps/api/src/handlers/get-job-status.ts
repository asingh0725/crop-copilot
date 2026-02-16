import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { RecommendationJobStatusResponseSchema } from '@crop-copilot/contracts';
import { jsonResponse } from '../lib/http';
import { getRecommendationStore } from '../lib/store';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';

export function buildGetJobStatusHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    const jobId = event.pathParameters?.jobId;

    if (!jobId) {
      return jsonResponse(
        {
          error: {
            code: 'MISSING_JOB_ID',
            message: 'jobId path parameter is required',
          },
        },
        { statusCode: 400 }
      );
    }

    const status = await getRecommendationStore().getJobStatus(jobId, auth.userId);
    if (!status) {
      return jsonResponse(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'recommendation job not found',
          },
        },
        { statusCode: 404 }
      );
    }

    return jsonResponse(RecommendationJobStatusResponseSchema.parse(status), {
      statusCode: 200,
    });
  }, verifier);
}

export const handler = buildGetJobStatusHandler();
