import type { AppAuthClient, AppAuthError, AppAuthSession, AppAuthUser } from './types';

function toError(message: string): AppAuthError {
  return { message };
}

async function readJson(response: Response): Promise<any> {
  return response.json().catch(() => ({}));
}

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T | null; error: AppAuthError | null }> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
    const body = (await readJson(response)) as { session?: AppAuthSession; user?: AppAuthUser; error?: { message?: string } };

    if (!response.ok) {
      return {
        data: null,
        error: toError(body.error?.message ?? `Request failed (${response.status})`),
      };
    }

    return { data: body as T, error: null };
  } catch (error) {
    return {
      data: null,
      error: toError((error as Error).message || 'Request failed'),
    };
  }
}

export function createCognitoBrowserAuthClient(): AppAuthClient {
  return {
    auth: {
      async getSession() {
        const { data, error } = await request<{ session?: AppAuthSession }>('/api/auth/session');
        return {
          data: { session: data?.session ?? null },
          error,
        };
      },
      async getUser() {
        const { data, error } = await request<{ session?: AppAuthSession }>('/api/auth/session');
        return {
          data: { user: data?.session?.user ?? null },
          error,
        };
      },
      async signInWithPassword(input) {
        const { data, error } = await request<{ session?: AppAuthSession }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return {
          data: {
            session: data?.session ?? null,
            user: data?.session?.user ?? null,
          },
          error,
        };
      },
      async signUp(input) {
        const { data, error } = await request<{ session?: AppAuthSession }>('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return {
          data: {
            session: data?.session ?? null,
            user: data?.session?.user ?? null,
          },
          error,
        };
      },
      async signOut() {
        const { error } = await request('/api/auth/logout', { method: 'POST' });
        return { error };
      },
      async exchangeCodeForSession() {
        return { error: toError('Cognito login does not use exchangeCodeForSession.') };
      },
    },
  };
}
