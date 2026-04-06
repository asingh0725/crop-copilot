import { NextRequest, NextResponse } from 'next/server';
import { clearCognitoCookies, readCognitoCookiesFromRequest } from '@/lib/auth/cognito-cookies';
import { isLocalAuthRequest } from '@/lib/auth/local-auth';
import { globalSignOut } from '@/lib/auth/cognito-public';
import { getAuthProvider } from '@/lib/auth/provider';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const provider = getAuthProvider();

  if (provider === 'local') {
    if (!isLocalAuthRequest(request)) {
      return NextResponse.json(
        { error: { message: 'Local auth is restricted to localhost development.' } },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (provider !== 'cognito') {
    return NextResponse.json({ ok: true });
  }

  const tokens = readCognitoCookiesFromRequest(request);
  if (tokens.accessToken) {
    await globalSignOut(tokens.accessToken).catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true });
  clearCognitoCookies(response);
  return response;
}
