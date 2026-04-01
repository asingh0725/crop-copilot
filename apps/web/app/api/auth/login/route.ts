import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/lib/auth/provider';
import { signInWithPassword } from '@/lib/auth/cognito-public';
import { buildSessionFromTokens } from '@/lib/auth/cognito-jwt';
import { writeCognitoCookies } from '@/lib/auth/cognito-cookies';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (getAuthProvider() !== 'cognito') {
    return NextResponse.json(
      { error: { message: 'Cognito auth is not enabled.' } },
      { status: 404 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };

  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: { message: 'Email and password are required.' } },
      { status: 400 }
    );
  }

  try {
    const tokens = await signInWithPassword(body.email, body.password);
    const session = await buildSessionFromTokens({
      idToken: tokens.idToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });

    const response = NextResponse.json({ session });
    writeCognitoCookies(response, {
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenType: tokens.tokenType,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: { message: (error as Error).message || 'Login failed.' } },
      { status: 401 }
    );
  }
}
