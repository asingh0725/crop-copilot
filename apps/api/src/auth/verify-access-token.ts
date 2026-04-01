import { decodeJwt } from 'jose';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { AuthError } from './errors';
import { verifyCognitoToken } from './cognito-auth';
import { resolveAuthenticatedUser } from './identity-store';
import {
  verifyAccessTokenFromEvent as verifySupabaseAccessTokenFromEvent,
  verifySupabaseIdentityFromEvent,
  getBearerToken,
} from './supabase-auth';
import type { AuthContext } from './types';

const COGNITO_ID_TOKEN_COOKIE = 'cc-auth-id-token';
const COGNITO_ACCESS_TOKEN_COOKIE = 'cc-auth-access-token';

function hasCognitoConfig(): boolean {
  return Boolean(process.env.COGNITO_REGION?.trim() && process.env.COGNITO_USER_POOL_ID?.trim());
}

function hasSupabaseConfig(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim() &&
      (process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim()
  );
}

function buildCognitoIssuer(): string | null {
  if (!hasCognitoConfig()) {
    return null;
  }

  return `https://cognito-idp.${process.env.COGNITO_REGION!.trim()}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID!.trim()}`;
}

function readCookieValue(event: APIGatewayProxyEventV2, cookieName: string): string | undefined {
  const header =
    event.headers?.cookie ??
    event.headers?.Cookie ??
    (Array.isArray(event.cookies) ? event.cookies.join('; ') : undefined);

  if (!header) {
    return undefined;
  }

  const parts = header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const name = part.slice(0, separator);
    if (name !== cookieName) {
      continue;
    }

    return decodeURIComponent(part.slice(separator + 1));
  }

  return undefined;
}

function detectProviderFromToken(token: string): 'cognito' | 'supabase' {
  const issuer = buildCognitoIssuer();

  try {
    const payload = decodeJwt(token);
    if (
      issuer &&
      typeof payload.iss === 'string' &&
      payload.iss === issuer &&
      (payload.token_use === 'id' || payload.token_use === 'access')
    ) {
      return 'cognito';
    }
  } catch {
    // Fall through to configured-provider fallback.
  }

  if (hasSupabaseConfig()) {
    return 'supabase';
  }

  if (hasCognitoConfig()) {
    return 'cognito';
  }

  throw new AuthError(
    'Authentication is not configured. Provide Cognito settings or SUPABASE_URL + SUPABASE_ANON_KEY.',
    500,
    'AUTH_CONFIG_ERROR'
  );
}

export async function verifyAccessTokenFromEvent(
  event: APIGatewayProxyEventV2
): Promise<AuthContext> {
  const cognitoCookieToken =
    readCookieValue(event, COGNITO_ID_TOKEN_COOKIE) ?? readCookieValue(event, COGNITO_ACCESS_TOKEN_COOKIE);
  if (cognitoCookieToken) {
    const identity = await verifyCognitoToken(cognitoCookieToken);
    return resolveAuthenticatedUser(identity);
  }

  try {
    const token = getBearerToken(event.headers ?? {});
    const provider = detectProviderFromToken(token);

    if (provider === 'cognito') {
      const identity = await verifyCognitoToken(token);
      return resolveAuthenticatedUser(identity);
    }

    const identity = await verifySupabaseIdentityFromEvent(event);
    return resolveAuthenticatedUser(identity);
  } catch (error) {
    if (error instanceof AuthError && error.code === 'UNAUTHORIZED') {
      if (hasSupabaseConfig()) {
        return verifySupabaseAccessTokenFromEvent(event);
      }
    }

    throw error;
  }
}
