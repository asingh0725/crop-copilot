import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { AuthError } from './errors';
import { getBearerToken } from './supabase-auth';
import type { AuthContext } from './types';

const DEFAULT_LOCAL_USER_ID = '80d8a54f-5c9b-4094-905a-862baadfdb3c';
const DEFAULT_LOCAL_EMAIL = 'avirajdhooria2001@gmail.com';
const DEFAULT_LOCAL_TOKEN = 'crop-copilot-local-dev-token';

function isTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

export function isLocalAuthEnabled(): boolean {
  const explicit = (
    process.env.AUTH_PROVIDER ??
    process.env.NEXT_PUBLIC_AUTH_PROVIDER ??
    ''
  )
    .trim()
    .toLowerCase();

  if (explicit === 'local') {
    return process.env.NODE_ENV !== 'production';
  }

  return isTruthy(process.env.LOCAL_AUTH_ENABLED) && process.env.NODE_ENV !== 'production';
}

export function getLocalAuthToken(): string {
  return process.env.LOCAL_AUTH_BEARER_TOKEN?.trim() || DEFAULT_LOCAL_TOKEN;
}

export function getLocalAuthContext(): AuthContext {
  const userId = process.env.LOCAL_AUTH_USER_ID?.trim() || DEFAULT_LOCAL_USER_ID;
  const email = process.env.LOCAL_AUTH_EMAIL?.trim() || DEFAULT_LOCAL_EMAIL;

  return {
    userId,
    email,
    scopes: ['admin', 'local'],
    tokenUse: 'local',
    authProvider: 'local',
    authSubject: userId,
  };
}

function getRequestHost(event: APIGatewayProxyEventV2): string {
  const host =
    event.headers?.host ??
    event.headers?.Host ??
    event.headers?.['x-forwarded-host'] ??
    event.headers?.['X-Forwarded-Host'] ??
    '';

  return host.split(',')[0]?.trim().toLowerCase() ?? '';
}

function stripPort(host: string): string {
  if (host.startsWith('[')) {
    const index = host.indexOf(']');
    return index >= 0 ? host.slice(1, index) : host;
  }

  return host.split(':')[0] ?? host;
}

export function isLocalRequestEvent(event: APIGatewayProxyEventV2): boolean {
  const host = stripPort(getRequestHost(event));
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.localhost')
  ) {
    return true;
  }

  const sourceIp = event.requestContext?.http?.sourceIp?.trim().toLowerCase() ?? '';
  return sourceIp === '127.0.0.1' || sourceIp === '::1' || sourceIp === '';
}

export function verifyLocalAccessTokenFromEvent(event: APIGatewayProxyEventV2): AuthContext {
  if (!isLocalAuthEnabled()) {
    throw new AuthError('Local auth is not enabled.', 500, 'AUTH_CONFIG_ERROR');
  }

  if (!isLocalRequestEvent(event)) {
    throw new AuthError(
      'Local auth is restricted to localhost development requests.',
      403,
      'LOCAL_AUTH_FORBIDDEN'
    );
  }

  let token: string;
  try {
    token = getBearerToken(event.headers ?? {});
  } catch {
    throw new AuthError('Missing local auth bearer token.', 401, 'UNAUTHORIZED');
  }

  if (token !== getLocalAuthToken()) {
    throw new AuthError('Invalid local auth bearer token.', 401, 'INVALID_TOKEN');
  }

  return getLocalAuthContext();
}
