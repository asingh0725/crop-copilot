import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { createPresignedViewUrl } from '../storage/presigned-upload';

const QuerySchema = z.object({
  objectUrl: z.string().url(),
});

type ViewUrlFactory = typeof createPresignedViewUrl;

export function buildGetUploadViewUrlHandler(
  verifier?: AuthVerifier,
  viewUrlFactory: ViewUrlFactory = createPresignedViewUrl
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    const parsed = QuerySchema.safeParse(event.queryStringParameters ?? {});
    if (!parsed.success) {
      return jsonResponse(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'objectUrl query parameter is required',
          },
        },
        { statusCode: 400 }
      );
    }

    try {
      const payload = await viewUrlFactory(auth.userId, parsed.data.objectUrl);
      return jsonResponse(payload, { statusCode: 200 });
    } catch (error) {
      const message = (error as Error).message;

      if (message.includes('Forbidden')) {
        return jsonResponse(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Object access is not allowed for this user',
            },
          },
          { statusCode: 403 }
        );
      }

      if (message.includes('Invalid objectUrl')) {
        return jsonResponse(
          {
            error: {
              code: 'BAD_REQUEST',
              message: 'Invalid objectUrl',
            },
          },
          { statusCode: 400 }
        );
      }

      console.error('Failed to create upload view URL', error);
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

export const handler = buildGetUploadViewUrlHandler();
