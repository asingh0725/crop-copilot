import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { CreateInputCommandSchema } from '@crop-copilot/contracts';
import { jsonResponse, parseJsonBody } from '../lib/http';
import { getRecommendationStore } from '../lib/store';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';

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
  }, verifier);
}

export const handler = buildCreateInputHandler();
