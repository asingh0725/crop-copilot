import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isTokenExpired } from '@/lib/auth/cognito-jwt';
import {
  COGNITO_ID_TOKEN_COOKIE,
  COGNITO_REFRESH_TOKEN_COOKIE,
} from '@/lib/auth/cognito-cookies';
import { getAuthProvider } from '@/lib/auth/provider';

const protectedPaths = ['/dashboard', '/diagnose', '/recommendations', '/products', '/history', '/settings', '/admin'];
const authPaths = ['/login', '/signup'];

function isProtectedPath(pathname: string): boolean {
  return protectedPaths.some((path) => pathname.startsWith(path));
}

function isAuthPath(pathname: string): boolean {
  return authPaths.some((path) => pathname.startsWith(path));
}

async function handleSupabaseMiddleware(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedPath(request.nextUrl.pathname) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (isAuthPath(request.nextUrl.pathname) && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return response;
}

function hasCognitoSession(request: NextRequest): boolean {
  const idToken = request.cookies.get(COGNITO_ID_TOKEN_COOKIE)?.value;
  if (idToken && !isTokenExpired(idToken)) {
    return true;
  }

  return Boolean(request.cookies.get(COGNITO_REFRESH_TOKEN_COOKIE)?.value);
}

function handleCognitoMiddleware(request: NextRequest): NextResponse {
  const authenticated = hasCognitoSession(request);

  if (isProtectedPath(request.nextUrl.pathname) && !authenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (isAuthPath(request.nextUrl.pathname) && authenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: { headers: request.headers } });
}

export async function middleware(request: NextRequest) {
  if (getAuthProvider() === 'cognito') {
    return handleCognitoMiddleware(request);
  }

  return handleSupabaseMiddleware(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
