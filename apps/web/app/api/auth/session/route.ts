import { NextRequest, NextResponse } from 'next/server';
import { buildSessionFromTokens, isTokenExpired } from '@/lib/auth/cognito-jwt';
import {
  clearCognitoCookies,
  readCognitoCookiesFromRequest,
  writeCognitoCookies,
} from '@/lib/auth/cognito-cookies';
import { buildLocalSession, isLocalAuthRequest } from '@/lib/auth/local-auth';
import { refreshSession } from '@/lib/auth/cognito-public';
import { getAuthProvider } from '@/lib/auth/provider';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const provider = getAuthProvider();

  if (provider === 'local') {
    if (!isLocalAuthRequest(request)) {
      return NextResponse.json(
        { error: { message: 'Local auth is restricted to localhost development.' } },
        { status: 403 }
      );
    }

    return NextResponse.json({ session: buildLocalSession() });
  }

  if (provider !== 'cognito') {
    return NextResponse.json({ session: null });
  }

  const tokens = readCognitoCookiesFromRequest(request);
  if (!tokens.idToken || !tokens.accessToken) {
    return NextResponse.json({ session: null });
  }

  try {
    let activeTokens = {
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 3600,
      tokenType: 'Bearer',
    };

    if (isTokenExpired(tokens.idToken)) {
      if (!tokens.refreshToken) {
        const response = NextResponse.json({ session: null });
        clearCognitoCookies(response);
        return response;
      }

      const refreshed = await refreshSession(tokens.refreshToken);
      activeTokens = {
        accessToken: refreshed.accessToken,
        idToken: refreshed.idToken,
        refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
        expiresIn: refreshed.expiresIn,
        tokenType: refreshed.tokenType ?? 'Bearer',
      };
    }

    const session = await buildSessionFromTokens({
      idToken: activeTokens.idToken,
      accessToken: activeTokens.accessToken,
      refreshToken: activeTokens.refreshToken,
    });

    const response = NextResponse.json({ session });
    writeCognitoCookies(response, activeTokens);
    return response;
  } catch {
    const response = NextResponse.json({ session: null });
    clearCognitoCookies(response);
    return response;
  }
}
