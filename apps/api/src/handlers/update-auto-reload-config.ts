import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import { updateAutoReloadConfig } from '../lib/entitlements';

const UpdateAutoReloadSchema = z.object({
  enabled: z.boolean().optional(),
  thresholdUsd: z.number().min(1).max(50).optional(),
  monthlyLimitUsd: z.number().min(12).max(500).optional(),
});

export function buildUpdateAutoReloadConfigHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    let payload: z.infer<typeof UpdateAutoReloadSchema>;

    try {
      payload = UpdateAutoReloadSchema.parse(parseJsonBody<unknown>(event.body));
    } catch (error) {
      if (error instanceof z.ZodError || isBadRequestError(error)) {
        return jsonResponse(
          { error: { code: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid request payload' } },
          { statusCode: 400 }
        );
      }
      return jsonResponse(
        { error: { code: 'BAD_REQUEST', message: 'Invalid request payload' } },
        { statusCode: 400 }
      );
    }

    const pool = getRuntimePool();
    const config = await updateAutoReloadConfig(pool, auth.userId, payload);
    return jsonResponse({ config }, { statusCode: 200 });
  }, verifier);
}

export const handler = buildUpdateAutoReloadConfigHandler();
