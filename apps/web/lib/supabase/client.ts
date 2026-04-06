import { createCognitoBrowserAuthClient } from '@/lib/auth/cognito-browser-client';
import { createLocalBrowserAuthClient } from '@/lib/auth/local-auth';
import { getAuthProvider } from '@/lib/auth/provider';
import { createSupabaseBrowserAuthClient } from '@/lib/auth/supabase-adapter';
import type { AppAuthClient } from '@/lib/auth/types';

export function createClient(): AppAuthClient {
  const provider = getAuthProvider();

  if (provider === 'local') {
    return createLocalBrowserAuthClient();
  }

  if (provider === 'cognito') {
    return createCognitoBrowserAuthClient();
  }

  return createSupabaseBrowserAuthClient();
}
