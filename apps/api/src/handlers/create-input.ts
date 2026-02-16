import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { CreateInputCommandSchema } from '@crop-copilot/contracts';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { getRecommendationStore, type EnqueueInputResult } from '../lib/store';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import {
  getRecommendationQueue,
  type RecommendationQueue,
} from '../queue/recommendation-queue';

function isValidationError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'ZodError';
}

export function buildCreateInputHandler(
  verifier?: AuthVerifier,
  queue: RecommendationQueue = getRecommendationQueue()
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    let command: ReturnType<typeof CreateInputCommandSchema.parse>;
    try {
      const payload = parseJsonBody<unknown>(event.body);
      command = CreateInputCommandSchema.parse(payload);
    } catch (error) {
      if (isValidationError(error) || isBadRequestError(error)) {
        return jsonResponse(
          {
            error: {
              code: 'BAD_REQUEST',
              message: error.message,
            },
          },
          { statusCode: 400 }
        );
      }

      console.error('Failed to parse create-input request', error);

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

    let enqueueResponse: EnqueueInputResult;
    try {
      enqueueResponse = await getRecommendationStore().enqueueInput(auth.userId, command);
    } catch (error) {
      console.error('Failed to persist recommendation command', error);

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

    if (enqueueResponse.wasCreated) {
      try {
        await queue.publishRecommendationJob({
          messageType: 'recommendation.job.requested',
          messageVersion: '1',
          requestedAt: new Date().toISOString(),
          userId: auth.userId,
          inputId: enqueueResponse.inputId,
          jobId: enqueueResponse.jobId,
        });
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
    }

    return jsonResponse(
      {
        inputId: enqueueResponse.inputId,
        jobId: enqueueResponse.jobId,
        status: enqueueResponse.status,
        acceptedAt: enqueueResponse.acceptedAt,
      },
      { statusCode: 202 }
    );
  }, verifier);
}

export const handler = buildCreateInputHandler();
