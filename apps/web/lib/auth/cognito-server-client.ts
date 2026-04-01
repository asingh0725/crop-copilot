import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import type { NextRequest } from 'next/server';
import { buildSessionFromTokens, isTokenExpired } from './cognito-jwt';
import { readCognitoCookiesFromRequest, type StoredCognitoTokens } from './cognito-cookies';
import { refreshSession } from './cognito-public';
import type { AppAuthClient, AppAuthError, AppAuthSession } from './types';

function toError(message: string): AppAuthError {
  return { message };
}

function readTokensFromCookieStore(cookieStore: ReadonlyRequestCookies): StoredCognitoTokens {
  return {
    accessToken: cookieStore.get('cc-auth-access-token')?.value,
    idToken: cookieStore.get('cc-auth-id-token')?.value,
    refreshToken: cookieStore.get('cc-auth-refresh-token')?.value,
  };
}

async function resolveSessionFromTokens(tokens: StoredCognitoTokens): Promise<AppAuthSession | null> {
  if (!tokens.idToken || !tokens.accessToken) {
    return null;
  }

  if (!isTokenExpired(tokens.idToken)) {
    return buildSessionFromTokens({
      idToken: tokens.idToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  }

  if (!tokens.refreshToken) {
    return null;
  }

  const refreshed = await refreshSession(tokens.refreshToken);
  return buildSessionFromTokens({
    idToken: refreshed.idToken,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
  });
}

export async function resolveServerCognitoSession(
  cookieStore: ReadonlyRequestCookies
): Promise<AppAuthSession | null> {
  return resolveSessionFromTokens(readTokensFromCookieStore(cookieStore));
}

export async function resolveRequestCognitoSession(
  request: NextRequest
): Promise<AppAuthSession | null> {
  return resolveSessionFromTokens(readCognitoCookiesFromRequest(request));
}

export function createCognitoServerAuthClient(cookieStore: ReadonlyRequestCookies): AppAuthClient {
  return {
    auth: {
      async getSession() {
        try {
          const session = await resolveServerCognitoSession(cookieStore);
          return { data: { session }, error: null };
        } catch (error) {
          return { data: { session: null }, error: toError((error as Error).message) };
        }
      },
      async getUser() {
        try {
          const session = await resolveServerCognitoSession(cookieStore);
          return { data: { user: session?.user ?? null }, error: null };
        } catch (error) {
          return { data: { user: null }, error: toError((error as Error).message) };
        }
      },
      async signInWithPassword() {
        return {
          data: { session: null, user: null },
          error: toError('Server-side password login is not supported.'),
        };
      },
      async signUp() {
        return {
          data: { session: null, user: null },
          error: toError('Server-side sign up is not supported.'),
        };
      },
      async signOut() {
        return { error: null };
      },
      async exchangeCodeForSession() {
        return { error: toError('Cognito login does not use exchangeCodeForSession.') };
      },
    },
  };
}
