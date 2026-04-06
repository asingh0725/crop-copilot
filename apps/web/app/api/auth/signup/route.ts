import { NextRequest, NextResponse } from 'next/server';
import { buildLocalSession, isLocalAuthRequest } from '@/lib/auth/local-auth';
import { getAuthProvider } from '@/lib/auth/provider';
import { signUpWithPassword } from '@/lib/auth/cognito-public';
import { buildSessionFromTokens } from '@/lib/auth/cognito-jwt';
import { writeCognitoCookies } from '@/lib/auth/cognito-cookies';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const provider = getAuthProvider();

  if (provider === 'local') {
    if (!isLocalAuthRequest(request)) {
      return NextResponse.json(
        { error: { message: 'Local auth is restricted to localhost development.' } },
        { status: 403 }
      );
    }

    return NextResponse.json({ session: buildLocalSession() }, { status: 201 });
  }

  if (provider !== 'cognito') {
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
    const tokens = await signUpWithPassword(body.email, body.password);
    const session = await buildSessionFromTokens({
      idToken: tokens.idToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });

    const response = NextResponse.json({ session }, { status: 201 });
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
      { error: { message: (error as Error).message || 'Sign up failed.' } },
      { status: 400 }
    );
  }
}
