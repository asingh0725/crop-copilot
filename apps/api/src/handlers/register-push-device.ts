import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';

const RegisterPushDeviceSchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  deviceToken: z.string().min(20).max(500),
  appVersion: z.string().max(40).optional(),
});

export function buildRegisterPushDeviceHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    let payload: z.infer<typeof RegisterPushDeviceSchema>;

    try {
      payload = RegisterPushDeviceSchema.parse(parseJsonBody<unknown>(event.body));
    } catch (error) {
      if (error instanceof z.ZodError || isBadRequestError(error)) {
        return jsonResponse(
          {
            error: {
              code: 'BAD_REQUEST',
              message: error instanceof Error ? error.message : 'Invalid request payload',
            },
          },
          { statusCode: 400 }
        );
      }

      return jsonResponse(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Invalid request payload',
          },
        },
        { statusCode: 400 }
      );
    }

    try {
      const pool = getRuntimePool();
      await pool.query(
        `
          INSERT INTO "PushDevice" (
            "userId",
            platform,
            "deviceToken",
            "appVersion",
            status,
            "lastSeenAt",
            "createdAt"
          )
          VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
          ON CONFLICT ("deviceToken") DO UPDATE
            SET
              "userId" = EXCLUDED."userId",
              platform = EXCLUDED.platform,
              "appVersion" = EXCLUDED."appVersion",
              status = 'active',
              "lastSeenAt" = NOW()
        `,
        [auth.userId, payload.platform, payload.deviceToken, payload.appVersion ?? null]
      );

      return jsonResponse(
        {
          success: true,
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('Failed to register push token', {
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

export const handler = buildRegisterPushDeviceHandler();
