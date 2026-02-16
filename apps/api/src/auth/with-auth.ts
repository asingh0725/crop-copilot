import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { jsonResponse } from '../lib/http';
import { AuthError } from './errors';
import type { AuthContext, AuthVerifier } from './types';
import { verifyAccessTokenFromEvent } from './cognito-jwt';

export type AuthenticatedHandler = (
  event: APIGatewayProxyEventV2,
  auth: AuthContext
) => Promise<APIGatewayProxyResultV2>;

export function withAuth(
  handler: AuthenticatedHandler,
  verifier: AuthVerifier = verifyAccessTokenFromEvent
): APIGatewayProxyHandlerV2 {
  return async (event) => {
    try {
      const auth = await verifier(event);
      return handler(event, auth);
    } catch (error) {
      if (error instanceof AuthError) {
        return jsonResponse(
          {
            error: {
              code: error.code,
              message: error.message,
            },
          },
          { statusCode: error.statusCode }
        );
      }

      return jsonResponse(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication failed',
          },
        },
        { statusCode: 401 }
      );
    }
  };
}
