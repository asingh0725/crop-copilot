import { createClient } from '@/lib/supabase/server'
import { getAuthProvider } from '@/lib/auth/provider'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const next = searchParams.get('next') ?? '/dashboard'

  if (getAuthProvider() !== 'supabase') {
    return NextResponse.redirect(`${origin}${next}`)
  }

  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth-callback-error`)
}
