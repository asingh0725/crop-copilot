import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { CreateInputCommandSchema } from '@crop-copilot/contracts';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { getRecommendationStore } from '../lib/store';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';

function isValidationError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'ZodError';
}

export function buildCreateInputHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    try {
      const payload = parseJsonBody<unknown>(event.body);
      const command = CreateInputCommandSchema.parse(payload);

      const response = getRecommendationStore().enqueueInput(auth.userId, command);

      return jsonResponse(response, { statusCode: 202 });
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

      console.error('Failed to enqueue recommendation input', error);

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

export const handler = buildCreateInputHandler();
