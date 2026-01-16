import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { getRequiredEnv } from './lib/env'

type CookiesToSet = Parameters<SetAllCookies>[0]
type CookieToSet = CookiesToSet[number]

export async function middleware(request: NextRequest): Promise<NextResponse> {
  let response: NextResponse = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll(): ReturnType<NextRequest['cookies']['getAll']> {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookiesToSet): void {
          cookiesToSet.forEach(
            ({ name, value }: CookieToSet): void => {
              request.cookies.set(name, value)
            }
          )
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          cookiesToSet.forEach(
            ({ name, value, options }: CookieToSet): void => {
              response.cookies.set(name, value, options)
            }
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const protectedPaths: readonly string[] = [
    '/dashboard',
    '/diagnose',
    '/recommendations',
    '/products',
    '/history',
    '/settings',
  ]
  const isProtected: boolean = protectedPaths.some((path: string): boolean =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const authPaths: readonly string[] = ['/login', '/signup']
  const isAuthPage: boolean = authPaths.some((path: string): boolean =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isAuthPage && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return response
}

export const config: { matcher: string[] } = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
