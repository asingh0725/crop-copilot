import { createCognitoBrowserAuthClient } from '@/lib/auth/cognito-browser-client';
import { getAuthProvider } from '@/lib/auth/provider';
import { createSupabaseBrowserAuthClient } from '@/lib/auth/supabase-adapter';
import type { AppAuthClient } from '@/lib/auth/types';

export function createClient(): AppAuthClient {
  if (getAuthProvider() === 'cognito') {
    return createCognitoBrowserAuthClient();
  }

  return createSupabaseBrowserAuthClient();
}
