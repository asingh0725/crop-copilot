import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { CreateInputCommandSchema, type CreateInputCommand } from '@crop-copilot/contracts';
import { jsonResponse, parseJsonBody } from '../lib/http';
import { getRecommendationStore } from '../lib/store';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { getRecommendationQueue, type RecommendationQueue } from '../queue/recommendation-queue';

export function buildCreateInputHandler(
  verifier?: AuthVerifier,
  queue: RecommendationQueue = getRecommendationQueue()
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    const traceId =
      event.requestContext?.requestId ??
      event.headers?.['x-request-id'] ??
      event.headers?.['X-Request-Id'];

    let command: CreateInputCommand;
    try {
      const payload = parseJsonBody<unknown>(event.body);
      command = CreateInputCommandSchema.parse(payload);
    } catch (error) {
      return jsonResponse(
        {
          error: {
            code: 'BAD_REQUEST',
            message: (error as Error).message,
          },
        },
        { statusCode: 400 }
      );
    }

    try {
      const response = await getRecommendationStore().enqueueInput(
        auth.userId,
        command
      );

      await queue.publishRecommendationJob({
        messageType: 'recommendation.job.requested',
        messageVersion: '1',
        requestedAt: new Date().toISOString(),
        traceId,
        userId: auth.userId,
        inputId: response.inputId,
        jobId: response.jobId,
      });

      return jsonResponse(response, { statusCode: 202 });
    } catch (error) {
      return jsonResponse(
        {
          error: {
            code: 'PIPELINE_ENQUEUE_FAILED',
            message: (error as Error).message,
          },
        },
        { statusCode: 500 }
      );
    }
  }, verifier);
}

export const handler = buildCreateInputHandler();
