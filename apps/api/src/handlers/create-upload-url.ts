import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
  CreateUploadUrlRequestSchema,
  CreateUploadUrlResponseSchema,
} from '@crop-copilot/contracts';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { createPresignedUploadUrl } from '../storage/presigned-upload';

type UploadUrlFactory = typeof createPresignedUploadUrl;

function isValidationError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'ZodError';
}

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

      console.error('Failed to create presigned upload URL', error);

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

export const handler = buildCreateUploadUrlHandler();
