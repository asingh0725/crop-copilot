export interface AppAuthUser {
  id: string;
  email?: string | null;
}

export interface AppAuthSession {
  access_token: string;
  provider_access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: number;
  user: AppAuthUser;
  provider: 'supabase' | 'cognito' | 'local';
}

export interface AppAuthError {
  message: string;
}

export interface AppAuthClient {
  auth: {
    getSession(): Promise<{ data: { session: AppAuthSession | null }; error: AppAuthError | null }>;
    getUser(): Promise<{ data: { user: AppAuthUser | null }; error: AppAuthError | null }>;
    signInWithPassword(input: {
      email: string;
      password: string;
    }): Promise<{ data: { session: AppAuthSession | null; user: AppAuthUser | null }; error: AppAuthError | null }>;
    signUp(input: {
      email: string;
      password: string;
      options?: { emailRedirectTo?: string };
    }): Promise<{ data: { session: AppAuthSession | null; user: AppAuthUser | null }; error: AppAuthError | null }>;
    signOut(): Promise<{ error: AppAuthError | null }>;
    exchangeCodeForSession(code: string): Promise<{ error: AppAuthError | null }>;
  };
}
