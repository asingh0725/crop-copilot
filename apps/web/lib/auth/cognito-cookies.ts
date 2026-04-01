import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';

export const COGNITO_ACCESS_TOKEN_COOKIE = 'cc-auth-access-token';
export const COGNITO_ID_TOKEN_COOKIE = 'cc-auth-id-token';
export const COGNITO_REFRESH_TOKEN_COOKIE = 'cc-auth-refresh-token';

export interface CognitoTokenSet {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType?: string;
}

export interface StoredCognitoTokens {
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
}

function isSecureCookieRequest(): boolean {
  const appBaseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (appBaseUrl?.startsWith('https://')) {
    return true;
  }

  return process.env.NODE_ENV === 'production';
}

function buildCookieOptions(maxAgeSeconds: number): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookieRequest(),
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function readCognitoCookiesFromRequest(request: NextRequest): StoredCognitoTokens {
  return {
    accessToken: request.cookies.get(COGNITO_ACCESS_TOKEN_COOKIE)?.value,
    idToken: request.cookies.get(COGNITO_ID_TOKEN_COOKIE)?.value,
    refreshToken: request.cookies.get(COGNITO_REFRESH_TOKEN_COOKIE)?.value,
  };
}

export async function readCognitoCookiesFromStore(): Promise<StoredCognitoTokens> {
  const cookieStore = await cookies();
  return {
    accessToken: cookieStore.get(COGNITO_ACCESS_TOKEN_COOKIE)?.value,
    idToken: cookieStore.get(COGNITO_ID_TOKEN_COOKIE)?.value,
    refreshToken: cookieStore.get(COGNITO_REFRESH_TOKEN_COOKIE)?.value,
  };
}

export function clearCognitoCookies(response: NextResponse): void {
  const expired = { ...buildCookieOptions(0), expires: new Date(0), maxAge: 0 };
  response.cookies.set(COGNITO_ACCESS_TOKEN_COOKIE, '', expired);
  response.cookies.set(COGNITO_ID_TOKEN_COOKIE, '', expired);
  response.cookies.set(COGNITO_REFRESH_TOKEN_COOKIE, '', expired);
}

export function writeCognitoCookies(response: NextResponse, tokens: CognitoTokenSet): void {
  const accessOptions = buildCookieOptions(tokens.expiresIn);
  const refreshOptions = buildCookieOptions(60 * 60 * 24 * 30);

  response.cookies.set(COGNITO_ACCESS_TOKEN_COOKIE, tokens.accessToken, accessOptions);
  response.cookies.set(COGNITO_ID_TOKEN_COOKIE, tokens.idToken, accessOptions);

  if (tokens.refreshToken) {
    response.cookies.set(COGNITO_REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshOptions);
  }
}
