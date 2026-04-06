import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import type { NextRequest } from 'next/server';
import type { AppAuthClient, AppAuthError, AppAuthSession, AppAuthUser } from './types';

const DEFAULT_LOCAL_USER_ID = '80d8a54f-5c9b-4094-905a-862baadfdb3c';
const DEFAULT_LOCAL_EMAIL = 'avirajdhooria2001@gmail.com';
const DEFAULT_LOCAL_TOKEN = 'crop-copilot-local-dev-token';

function toError(message: string): AppAuthError {
  return { message };
}

function isAllowedLocalHost(hostname: string | null | undefined): boolean {
  const normalized = (hostname ?? '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost')
  );
}

export function isLocalAuthRequestHost(hostname: string | null | undefined): boolean {
  return isAllowedLocalHost(hostname);
}

export function isLocalAuthRuntimeAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function getLocalAuthUser(): AppAuthUser {
  return {
    id: process.env.LOCAL_AUTH_USER_ID?.trim() || DEFAULT_LOCAL_USER_ID,
    email: process.env.LOCAL_AUTH_EMAIL?.trim() || DEFAULT_LOCAL_EMAIL,
  };
}

export function getLocalAuthToken(): string {
  return process.env.LOCAL_AUTH_BEARER_TOKEN?.trim() || DEFAULT_LOCAL_TOKEN;
}

export function buildLocalSession(): AppAuthSession {
  return {
    access_token: getLocalAuthToken(),
    token_type: 'Bearer',
    user: getLocalAuthUser(),
    provider: 'local',
  };
}

function validateLocalCredentials(email: string): AppAuthError | null {
  if (!isLocalAuthRuntimeAllowed()) {
    return toError('Local auth is disabled outside local development.');
  }

  const expected = (getLocalAuthUser().email ?? '').toLowerCase();
  if (email.trim().toLowerCase() !== expected) {
    return toError(`Local auth only allows ${expected}.`);
  }

  return null;
}

function buildLocalClient(): AppAuthClient {
  return {
    auth: {
      async getSession() {
        return { data: { session: buildLocalSession() }, error: null };
      },
      async getUser() {
        return { data: { user: getLocalAuthUser() }, error: null };
      },
      async signInWithPassword(input) {
        const error = validateLocalCredentials(input.email);
        return {
          data: {
            session: error ? null : buildLocalSession(),
            user: error ? null : getLocalAuthUser(),
          },
          error,
        };
      },
      async signUp(input) {
        const error = validateLocalCredentials(input.email);
        return {
          data: {
            session: error ? null : buildLocalSession(),
            user: error ? null : getLocalAuthUser(),
          },
          error,
        };
      },
      async signOut() {
        return { error: null };
      },
      async exchangeCodeForSession() {
        return { error: null };
      },
    },
  };
}

export function createLocalBrowserAuthClient(): AppAuthClient {
  return buildLocalClient();
}

export function createLocalServerAuthClient(_cookieStore: ReadonlyRequestCookies): AppAuthClient {
  return buildLocalClient();
}

export function isLocalAuthRequest(request: NextRequest): boolean {
  return isLocalAuthRuntimeAllowed() && isLocalAuthRequestHost(request.nextUrl.hostname);
}
