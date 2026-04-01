import { createBrowserClient } from '@supabase/ssr';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import type { AppAuthClient, AppAuthError, AppAuthSession, AppAuthUser } from './types';

function toAppError(message: string): AppAuthError {
  return { message };
}

function toAppSession(session: {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  user: { id: string; email?: string | null };
} | null): AppAuthSession | null {
  if (!session) {
    return null;
  }

  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    token_type: session.token_type,
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
    },
    provider: 'supabase',
  };
}

function toAppUser(user: { id: string; email?: string | null } | null): AppAuthUser | null {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
  };
}

export function createSupabaseBrowserAuthClient(): AppAuthClient {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return {
    auth: {
      async getSession() {
        const { data, error } = await client.auth.getSession();
        return {
          data: { session: toAppSession(data.session) },
          error: error ? toAppError(error.message) : null,
        };
      },
      async getUser() {
        const { data, error } = await client.auth.getUser();
        return {
          data: { user: toAppUser(data.user) },
          error: error ? toAppError(error.message) : null,
        };
      },
      async signInWithPassword(input) {
        const { data, error } = await client.auth.signInWithPassword(input);
        return {
          data: {
            session: toAppSession(data.session),
            user: toAppUser(data.user),
          },
          error: error ? toAppError(error.message) : null,
        };
      },
      async signUp(input) {
        const { data, error } = await client.auth.signUp(input);
        return {
          data: {
            session: toAppSession(data.session),
            user: toAppUser(data.user),
          },
          error: error ? toAppError(error.message) : null,
        };
      },
      async signOut() {
        const { error } = await client.auth.signOut();
        return { error: error ? toAppError(error.message) : null };
      },
      async exchangeCodeForSession(code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        return { error: error ? toAppError(error.message) : null };
      },
    },
  };
}

export function createSupabaseServerAuthClient(cookieStore: ReadonlyRequestCookies): AppAuthClient {
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as CookieOptions)
            );
          } catch {
            // Server component context.
          }
        },
      },
    }
  );

  return {
    auth: {
      async getSession() {
        const { data, error } = await client.auth.getSession();
        return {
          data: { session: toAppSession(data.session) },
          error: error ? toAppError(error.message) : null,
        };
      },
      async getUser() {
        const { data, error } = await client.auth.getUser();
        return {
          data: { user: toAppUser(data.user) },
          error: error ? toAppError(error.message) : null,
        };
      },
      async signInWithPassword(input) {
        const { data, error } = await client.auth.signInWithPassword(input);
        return {
          data: {
            session: toAppSession(data.session),
            user: toAppUser(data.user),
          },
          error: error ? toAppError(error.message) : null,
        };
      },
      async signUp(input) {
        const { data, error } = await client.auth.signUp(input);
        return {
          data: {
            session: toAppSession(data.session),
            user: toAppUser(data.user),
          },
          error: error ? toAppError(error.message) : null,
        };
      },
      async signOut() {
        const { error } = await client.auth.signOut();
        return { error: error ? toAppError(error.message) : null };
      },
      async exchangeCodeForSession(code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        return { error: error ? toAppError(error.message) : null };
      },
    },
  };
}
