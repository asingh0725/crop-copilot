import {
  createServerClient,
  type CookieOptions,
  type SetAllCookies,
} from '@supabase/ssr'
import { cookies } from 'next/headers'

import { getRequiredEnv } from '../env'

type CookiesToSet = Parameters<SetAllCookies>[0]
type CookieToSet = CookiesToSet[number]

export async function createClient(): Promise<ReturnType<typeof createServerClient>> {
  const cookieStore = await cookies()

  return createServerClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll(): ReturnType<typeof cookieStore.getAll> {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookiesToSet): void {
          try {
            cookiesToSet.forEach(
              ({ name, value, options }: CookieToSet): void => {
                cookieStore.set(name, value, options)
              }
            )
          } catch {
            // Server component context
          }
        },
      },
    }
  )
}
