import { NextRequest, NextResponse } from 'next/server';
import { clearCognitoCookies, readCognitoCookiesFromRequest } from '@/lib/auth/cognito-cookies';
import { globalSignOut } from '@/lib/auth/cognito-public';
import { getAuthProvider } from '@/lib/auth/provider';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (getAuthProvider() !== 'cognito') {
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
