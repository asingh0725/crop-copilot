import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { AuthError } from './errors';
import type { AuthContext } from './types';

interface SupabaseAuthConfig {
  baseUrl: string;
  anonKey: string;
}

interface SupabaseUserResponse {
  id?: string;
  email?: string;
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

function isLikelyJwt(value: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
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
    const trimmed = candidate.trim();
    if (isLikelyJwt(trimmed)) {
      return trimmed;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
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

function resolveAccessToken(event: APIGatewayProxyEventV2): string {
  const headers = event.headers ?? {};

  try {
    return getBearerToken(headers);
  } catch (error) {
    const cookieHeader =
      headers.cookie ??
      headers.Cookie ??
      (Array.isArray(event.cookies) ? event.cookies.join('; ') : undefined);
    const cookieToken = extractSupabaseTokenFromCookieHeader(cookieHeader);
    if (cookieToken) {
      return cookieToken;
    }

    throw error;
  }
}

function resolveSupabaseAuthConfig(): SupabaseAuthConfig | null {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return {
    baseUrl: normalizeBaseUrl(supabaseUrl),
    anonKey: supabaseAnonKey,
  };
}

async function verifySupabaseAccessToken(
  token: string,
  config: SupabaseAuthConfig
): Promise<AuthContext> {
  const response = await fetch(`${config.baseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      apikey: config.anonKey,
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

export async function verifyAccessTokenFromEvent(
  event: APIGatewayProxyEventV2
): Promise<AuthContext> {
  const token = resolveAccessToken(event);
  const config = resolveSupabaseAuthConfig();

  if (!config) {
    throw new AuthError(
      'Supabase auth verifier is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.',
      500,
      'AUTH_CONFIG_ERROR'
    );
  }

  try {
    return await verifySupabaseAccessToken(token, config);
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    throw new AuthError('Invalid access token', 401, 'INVALID_TOKEN');
  }
}
