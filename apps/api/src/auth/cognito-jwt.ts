import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';
import { AuthError } from './errors';
import type { AuthContext } from './types';

export interface CognitoJwtConfig {
  region: string;
  userPoolId: string;
  clientId?: string;
}

interface SupabaseUserResponse {
  id?: string;
  email?: string;
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

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function maybeBase64Decode(value: string): string | null {
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function parseSupabaseCookieValue(value: string): string | undefined {
  const decoded = decodeURIComponent(value);
  const candidates = [decoded];

  if (decoded.startsWith('base64-')) {
    const decodedBase64 = maybeBase64Decode(decoded.slice('base64-'.length));
    if (decodedBase64) {
      candidates.push(decodedBase64);
    }
  } else {
    const decodedBase64 = maybeBase64Decode(decoded);
    if (decodedBase64) {
      candidates.push(decodedBase64);
    }
  }

  for (const candidate of candidates) {
    if (candidate.includes('.')) {
      return candidate;
    }

    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
        return parsed[0];
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        'access_token' in parsed &&
        typeof (parsed as { access_token?: unknown }).access_token === 'string'
      ) {
        return (parsed as { access_token: string }).access_token;
      }
    } catch {
      // ignore parse error and continue to next candidate
    }
  }

  return undefined;
}

function extractSupabaseTokenFromCookieHeader(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const cookies = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator <= 0) {
        return null;
      }
      const name = part.slice(0, separator);
      const value = part.slice(separator + 1);
      return { name, value };
    })
    .filter((part): part is { name: string; value: string } => Boolean(part));

  const direct = cookies.find((cookie) => /sb-.*-auth-token$/i.test(cookie.name));
  if (direct) {
    return parseSupabaseCookieValue(direct.value);
  }

  const chunks = cookies
    .map((cookie) => {
      const match = cookie.name.match(/^(sb-.*-auth-token)\.(\d+)$/i);
      if (!match) {
        return null;
      }

      return {
        prefix: match[1],
        index: Number(match[2]),
        value: cookie.value,
      };
    })
    .filter((chunk): chunk is { prefix: string; index: number; value: string } => Boolean(chunk))
    .sort((a, b) => a.index - b.index);

  if (chunks.length === 0) {
    return undefined;
  }

  const combined = chunks.map((chunk) => chunk.value).join('');
  return parseSupabaseCookieValue(combined);
}

function resolveAccessToken(headers: Record<string, string | undefined>): string {
  try {
    return getBearerToken(headers);
  } catch (error) {
    const cookieToken = extractSupabaseTokenFromCookieHeader(headers.cookie);
    if (cookieToken) {
      return cookieToken;
    }

    throw error;
  }
}

async function verifySupabaseAccessToken(token: string): Promise<AuthContext | null> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const response = await fetch(`${normalizeBaseUrl(supabaseUrl)}/auth/v1/user`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new AuthError('Invalid Supabase access token', 401, 'INVALID_TOKEN');
  }

  if (!response.ok) {
    throw new AuthError('Supabase token verification failed', 500, 'AUTH_CONFIG_ERROR');
  }

  const payload = (await response.json()) as SupabaseUserResponse;
  if (!payload.id) {
    throw new AuthError('Supabase token subject claim is missing', 401, 'INVALID_TOKEN');
  }

  return {
    userId: payload.id,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    scopes: [],
    tokenUse: 'access',
  };
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
  const token = resolveAccessToken(event.headers ?? {});
  const region = process.env.COGNITO_REGION;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_APP_CLIENT_ID;

  if (!region || !userPoolId) {
    const supabaseAuth = await verifySupabaseAccessToken(token);
    if (supabaseAuth) {
      return supabaseAuth;
    }

    throw new AuthError(
      'Auth verifier is not configured. Configure Cognito or Supabase verifier.',
      500,
      'AUTH_CONFIG_ERROR'
    );
  }

  try {
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
  } catch (error) {
    const supabaseAuth = await verifySupabaseAccessToken(token);
    if (supabaseAuth) {
      return supabaseAuth;
    }

    if (error instanceof AuthError) {
      throw error;
    }

    throw new AuthError('Invalid access token', 401, 'INVALID_TOKEN');
  }
}
