import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import { getAutoReloadConfig } from '../lib/entitlements';

export function buildGetAutoReloadConfigHandler(verifier?: AuthVerifier): APIGatewayProxyHandlerV2 {
  return withAuth(async (_event, auth) => {
    const pool = getRuntimePool();
    const config = await getAutoReloadConfig(pool, auth.userId);
    return jsonResponse({ config }, { statusCode: 200 });
  }, verifier);
}

export const handler = buildGetAutoReloadConfigHandler();
