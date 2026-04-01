import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { AuthError } from './errors';
import { resolveAuthenticatedUser, type VerifiedIdentity } from './identity-store';
import { getBearerToken } from './supabase-auth';
import type { AuthContext } from './types';

interface CognitoJwtPayload extends JWTPayload {
  token_use?: 'access' | 'id' | string;
  client_id?: string;
  aud?: string | string[];
  email?: string;
  username?: string;
  'cognito:username'?: string;
  scope?: string;
}

interface CognitoConfig {
  region: string;
  userPoolId: string;
  appClientId?: string;
}

function resolveConfig(): CognitoConfig {
  const region = process.env.COGNITO_REGION?.trim();
  const userPoolId = process.env.COGNITO_USER_POOL_ID?.trim();
  const appClientId = process.env.COGNITO_APP_CLIENT_ID?.trim() || undefined;

  if (!region || !userPoolId) {
    throw new AuthError(
      'Cognito auth verifier is not configured. Set COGNITO_REGION and COGNITO_USER_POOL_ID.',
      500,
      'AUTH_CONFIG_ERROR'
    );
  }

  return { region, userPoolId, appClientId };
}

function buildIssuer(config: CognitoConfig): string {
  return `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
}

function isEmailLike(value: string | undefined): value is string {
  return typeof value === 'string' && value.includes('@');
}

function resolveEmail(payload: CognitoJwtPayload): string | undefined {
  if (isEmailLike(payload.email)) {
    return payload.email;
  }

  if (isEmailLike(payload.username)) {
    return payload.username;
  }

  if (isEmailLike(payload['cognito:username'])) {
    return payload['cognito:username'];
  }

  return undefined;
}

function resolveScopes(payload: CognitoJwtPayload): string[] {
  if (typeof payload.scope !== 'string' || payload.scope.trim().length === 0) {
    return [];
  }

  return payload.scope
    .split(' ')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function assertClientBinding(payload: CognitoJwtPayload, config: CognitoConfig): void {
  if (!config.appClientId) {
    return;
  }

  const tokenUse = payload.token_use;
  if (tokenUse === 'access') {
    if (payload.client_id !== config.appClientId) {
      throw new AuthError('Invalid Cognito access token client binding', 401, 'INVALID_TOKEN');
    }
    return;
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(config.appClientId)) {
    throw new AuthError('Invalid Cognito ID token audience', 401, 'INVALID_TOKEN');
  }
}

export async function verifyCognitoToken(token: string): Promise<VerifiedIdentity> {
  const config = resolveConfig();
  const issuer = buildIssuer(config);
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  let payload: CognitoJwtPayload;
  try {
    const verified = await jwtVerify(token, jwks, {
      issuer,
    });
    payload = verified.payload as CognitoJwtPayload;
  } catch (error) {
    throw new AuthError(
      `Invalid Cognito token: ${(error as Error).message}`,
      401,
      'INVALID_TOKEN'
    );
  }

  if (payload.token_use !== 'access' && payload.token_use !== 'id') {
    throw new AuthError('Unsupported Cognito token type', 401, 'INVALID_TOKEN');
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new AuthError('Cognito token subject claim is missing', 401, 'INVALID_TOKEN');
  }

  assertClientBinding(payload, config);

  return {
    provider: 'cognito',
    subject: payload.sub,
    email: resolveEmail(payload),
    scopes: resolveScopes(payload),
    tokenUse: payload.token_use,
  };
}

export async function verifyCognitoAccessTokenFromEvent(
  event: APIGatewayProxyEventV2
): Promise<AuthContext> {
  const token = getBearerToken(event.headers ?? {});
  const identity = await verifyCognitoToken(token);
  return resolveAuthenticatedUser(identity);
}
