import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';
import { AuthError } from './errors';
import type { AuthContext } from './types';

export interface CognitoJwtConfig {
  region: string;
  userPoolId: string;
  clientId?: string;
}

function assertClientBinding(
  payload: JWTPayload,
  tokenUse: string | undefined,
  clientId: string
): void {
  if (tokenUse === 'access') {
    const tokenClientId =
      typeof payload.client_id === 'string' ? payload.client_id : undefined;
    if (tokenClientId !== clientId) {
      throw new AuthError('Token client claim does not match app client', 401, 'INVALID_TOKEN');
    }
    return;
  }

  if (tokenUse === 'id') {
    const audience = payload.aud;
    const matchesAudience =
      typeof audience === 'string'
        ? audience === clientId
        : Array.isArray(audience) && audience.includes(clientId);
    if (!matchesAudience) {
      throw new AuthError('Token audience claim does not match app client', 401, 'INVALID_TOKEN');
    }
  }
}

function resolveIssuer(config: CognitoJwtConfig): string {
  return `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
}

function resolveJwksUri(config: CognitoJwtConfig): URL {
  return new URL(`${resolveIssuer(config)}/.well-known/jwks.json`);
}

export function getBearerToken(headers: Record<string, string | undefined>): string {
  const authHeader = headers.authorization ?? headers.Authorization;
  if (!authHeader) {
    throw new AuthError('Missing Authorization header');
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new AuthError('Invalid Authorization header format');
  }

  return token;
}

export async function verifyJwtToken(
  token: string,
  config: CognitoJwtConfig,
  getKey?: JWTVerifyGetKey
): Promise<AuthContext> {
  const issuer = resolveIssuer(config);
  const keyResolver = getKey ?? createRemoteJWKSet(resolveJwksUri(config));

  const verified = await jwtVerify(token, keyResolver, {
    issuer,
  });
  const tokenUse =
    typeof verified.payload.token_use === 'string' ? verified.payload.token_use : undefined;
  if (config.clientId) {
    assertClientBinding(verified.payload, tokenUse, config.clientId);
  }

  return payloadToAuthContext(verified.payload);
}

function payloadToAuthContext(payload: JWTPayload): AuthContext {
  if (!payload.sub) {
    throw new AuthError('Token subject claim is missing');
  }

  const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ') : [];
  const email = typeof payload.email === 'string' ? payload.email : undefined;

  return {
    userId: payload.sub,
    email,
    scopes,
    tokenUse: typeof payload.token_use === 'string' ? payload.token_use : undefined,
  };
}

export async function verifyAccessTokenFromEvent(
  event: APIGatewayProxyEventV2,
  getKey?: JWTVerifyGetKey
): Promise<AuthContext> {
  const region = process.env.COGNITO_REGION;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_APP_CLIENT_ID;

  if (!region || !userPoolId) {
    throw new AuthError('Cognito verifier is not configured', 500, 'AUTH_CONFIG_ERROR');
  }

  const token = getBearerToken(event.headers ?? {});
  const auth = await verifyJwtToken(
    token,
    {
      region,
      userPoolId,
      clientId,
    },
    getKey
  );
  if (auth.tokenUse !== 'access') {
    throw new AuthError(
      'Access token is required for API requests',
      401,
      'INVALID_TOKEN_USE'
    );
  }

  return auth;
}
