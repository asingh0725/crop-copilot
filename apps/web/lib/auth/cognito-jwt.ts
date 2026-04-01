import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from 'jose';
import type { AppAuthSession, AppAuthUser } from './types';

interface CognitoJwtPayload extends JWTPayload {
  token_use?: 'access' | 'id' | string;
  email?: string;
  client_id?: string;
  aud?: string | string[];
  username?: string;
  'cognito:username'?: string;
}

interface CognitoConfig {
  region: string;
  userPoolId: string;
  appClientId: string;
}

function resolveConfig(): CognitoConfig {
  const region = (process.env.COGNITO_REGION ?? process.env.NEXT_PUBLIC_COGNITO_REGION)?.trim();
  const userPoolId = (process.env.COGNITO_USER_POOL_ID ?? process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID)?.trim();
  const appClientId = (process.env.COGNITO_APP_CLIENT_ID ?? process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID)?.trim();

  if (!region || !userPoolId || !appClientId) {
    throw new Error('Cognito JWT verification is not configured.');
  }

  return { region, userPoolId, appClientId };
}

function getIssuer(config: CognitoConfig): string {
  return `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
}

function resolveEmail(payload: CognitoJwtPayload): string | undefined {
  if (typeof payload.email === 'string' && payload.email.includes('@')) {
    return payload.email;
  }
  if (typeof payload.username === 'string' && payload.username.includes('@')) {
    return payload.username;
  }
  if (
    typeof payload['cognito:username'] === 'string' &&
    payload['cognito:username'].includes('@')
  ) {
    return payload['cognito:username'];
  }
  return undefined;
}

function assertAudience(payload: CognitoJwtPayload, config: CognitoConfig): void {
  if (payload.token_use === 'access') {
    if (payload.client_id !== config.appClientId) {
      throw new Error('Invalid Cognito access token client binding.');
    }
    return;
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(config.appClientId)) {
    throw new Error('Invalid Cognito ID token audience.');
  }
}

export function isTokenExpired(token: string | undefined, skewSeconds = 15): boolean {
  if (!token) {
    return true;
  }

  try {
    const payload = decodeJwt(token);
    const exp = typeof payload.exp === 'number' ? payload.exp : 0;
    return exp <= Math.floor(Date.now() / 1000) + skewSeconds;
  } catch {
    return true;
  }
}

export async function verifyCognitoJwt(token: string): Promise<CognitoJwtPayload> {
  const config = resolveConfig();
  const issuer = getIssuer(config);
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const verified = await jwtVerify(token, jwks, { issuer });
  const payload = verified.payload as CognitoJwtPayload;

  if (payload.token_use !== 'id' && payload.token_use !== 'access') {
    throw new Error('Unsupported Cognito token type.');
  }

  assertAudience(payload, config);
  return payload;
}

export async function buildSessionFromTokens(tokens: {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
}): Promise<AppAuthSession> {
  const payload = await verifyCognitoJwt(tokens.idToken);
  const user: AppAuthUser = {
    id: typeof payload.sub === 'string' ? payload.sub : 'unknown',
    email: resolveEmail(payload) ?? null,
  };

  return {
    access_token: tokens.idToken,
    provider_access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_type: 'Bearer',
    expires_at: typeof payload.exp === 'number' ? payload.exp : undefined,
    user,
    provider: 'cognito',
  };
}
