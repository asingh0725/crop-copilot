import test from 'node:test';
import assert from 'node:assert/strict';
import { getBearerToken, verifyAccessTokenFromEvent } from './supabase-auth';

test('extracts bearer token from authorization header', () => {
  const token = getBearerToken({ authorization: 'Bearer token-123' });
  assert.equal(token, 'token-123');
});

test('verifyAccessTokenFromEvent verifies bearer token against Supabase', async () => {
  const previousSupabaseUrl = process.env.SUPABASE_URL;
  const previousSupabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const originalFetch = globalThis.fetch;

  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-test-key';

  globalThis.fetch = async (_input, init) => {
    const authHeader = (init?.headers as Record<string, string> | undefined)?.authorization;
    assert.equal(authHeader, 'Bearer supabase-access-token');
    return new Response(
      JSON.stringify({
        id: '22222222-2222-4222-8222-222222222222',
        email: 'grower@example.com',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  try {
    const auth = await verifyAccessTokenFromEvent({
      headers: { authorization: 'Bearer supabase-access-token' },
    } as any);

    assert.equal(auth.userId, '22222222-2222-4222-8222-222222222222');
    assert.equal(auth.email, 'grower@example.com');
    assert.deepEqual(auth.scopes, []);
    assert.equal(auth.tokenUse, 'access');
  } finally {
    process.env.SUPABASE_URL = previousSupabaseUrl;
    process.env.SUPABASE_ANON_KEY = previousSupabaseAnonKey;
    globalThis.fetch = originalFetch;
  }
});

test('verifyAccessTokenFromEvent extracts Supabase access token from auth cookie', async () => {
  const previousSupabaseUrl = process.env.SUPABASE_URL;
  const previousSupabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const originalFetch = globalThis.fetch;

  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-test-key';

  const accessToken = 'header.payload.signature';
  globalThis.fetch = async (_input, init) => {
    const authHeader = (init?.headers as Record<string, string> | undefined)?.authorization;
    assert.equal(authHeader, `Bearer ${accessToken}`);
    return new Response(
      JSON.stringify({
        id: '33333333-3333-4333-8333-333333333333',
        email: 'cookie@example.com',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const cookieValue = encodeURIComponent(JSON.stringify([accessToken, 'refresh-token']));

  try {
    const auth = await verifyAccessTokenFromEvent({
      headers: { cookie: `sb-test-auth-token=${cookieValue}` },
    } as any);

    assert.equal(auth.userId, '33333333-3333-4333-8333-333333333333');
    assert.equal(auth.email, 'cookie@example.com');
    assert.deepEqual(auth.scopes, []);
    assert.equal(auth.tokenUse, 'access');
  } finally {
    process.env.SUPABASE_URL = previousSupabaseUrl;
    process.env.SUPABASE_ANON_KEY = previousSupabaseAnonKey;
    globalThis.fetch = originalFetch;
  }
});

test('verifyAccessTokenFromEvent extracts Supabase access token from API Gateway cookies array', async () => {
  const previousSupabaseUrl = process.env.SUPABASE_URL;
  const previousSupabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const originalFetch = globalThis.fetch;

  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-test-key';

  const accessToken = 'array.header.payload';
  globalThis.fetch = async (_input, init) => {
    const authHeader = (init?.headers as Record<string, string> | undefined)?.authorization;
    assert.equal(authHeader, `Bearer ${accessToken}`);
    return new Response(
      JSON.stringify({
        id: '44444444-4444-4444-8444-444444444444',
        email: 'cookies-array@example.com',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const cookieValue = encodeURIComponent(JSON.stringify([accessToken, 'refresh-token']));

  try {
    const auth = await verifyAccessTokenFromEvent({
      headers: {},
      cookies: [`sb-test-auth-token=${cookieValue}`],
    } as any);

    assert.equal(auth.userId, '44444444-4444-4444-8444-444444444444');
    assert.equal(auth.email, 'cookies-array@example.com');
    assert.deepEqual(auth.scopes, []);
    assert.equal(auth.tokenUse, 'access');
  } finally {
    process.env.SUPABASE_URL = previousSupabaseUrl;
    process.env.SUPABASE_ANON_KEY = previousSupabaseAnonKey;
    globalThis.fetch = originalFetch;
  }
});

test('verifyAccessTokenFromEvent returns configuration error without Supabase verifier env', async () => {
  const previousSupabaseUrl = process.env.SUPABASE_URL;
  const previousSupabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const previousPublicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousPublicSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    await assert.rejects(
      () =>
        verifyAccessTokenFromEvent({
          headers: { authorization: 'Bearer supabase-access-token' },
        } as any),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { code?: string }).code, 'AUTH_CONFIG_ERROR');
        return true;
      }
    );
  } finally {
    process.env.SUPABASE_URL = previousSupabaseUrl;
    process.env.SUPABASE_ANON_KEY = previousSupabaseAnonKey;
    process.env.NEXT_PUBLIC_SUPABASE_URL = previousPublicSupabaseUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousPublicSupabaseAnonKey;
  }
});
