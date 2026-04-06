export type AuthProvider = 'supabase' | 'cognito' | 'local';

function isTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

export function getAuthProvider(): AuthProvider {
  const explicit = process.env.NEXT_PUBLIC_AUTH_PROVIDER?.trim().toLowerCase();
  if (explicit === 'local' || explicit === 'cognito' || explicit === 'supabase') {
    return explicit;
  }

  const hasCognitoConfig = Boolean(
    (process.env.COGNITO_REGION ?? process.env.NEXT_PUBLIC_COGNITO_REGION)?.trim() &&
      (process.env.COGNITO_USER_POOL_ID ?? process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID)?.trim() &&
      (process.env.COGNITO_APP_CLIENT_ID ?? process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID)?.trim()
  );
  if (hasCognitoConfig) {
    return 'cognito';
  }

  if (isTruthy(process.env.PREFER_COGNITO_AUTH)) {
    return 'cognito';
  }

  return 'supabase';
}

export function isCognitoAuthEnabled(): boolean {
  return getAuthProvider() === 'cognito';
}
