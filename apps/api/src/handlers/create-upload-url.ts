import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
  CreateUploadUrlRequestSchema,
  CreateUploadUrlResponseSchema,
} from '@crop-copilot/contracts';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse, parseJsonBody } from '../lib/http';
import { createPresignedUploadUrl } from '../storage/presigned-upload';

type UploadUrlFactory = typeof createPresignedUploadUrl;

export function buildCreateUploadUrlHandler(
  verifier?: AuthVerifier,
  uploadFactory: UploadUrlFactory = createPresignedUploadUrl
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    try {
      const body = parseJsonBody<unknown>(event.body);
      const request = CreateUploadUrlRequestSchema.parse(body);
      const upload = await uploadFactory(auth.userId, request);

      return jsonResponse(CreateUploadUrlResponseSchema.parse(upload), {
        statusCode: 200,
      });
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

export const handler = buildCreateUploadUrlHandler();
