import { cookies } from 'next/headers';
import { createCognitoServerAuthClient } from '@/lib/auth/cognito-server-client';
import { getAuthProvider } from '@/lib/auth/provider';
import { createSupabaseServerAuthClient } from '@/lib/auth/supabase-adapter';
import type { AppAuthClient } from '@/lib/auth/types';

export async function createClient(): Promise<AppAuthClient> {
  const cookieStore = await cookies();

  if (getAuthProvider() === 'cognito') {
    return createCognitoServerAuthClient(cookieStore as any);
  }

  return createSupabaseServerAuthClient(cookieStore as any);
}
