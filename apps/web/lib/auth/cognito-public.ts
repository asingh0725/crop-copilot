interface CognitoConfig {
  region: string;
  userPoolId: string;
  appClientId: string;
}

export interface CognitoAuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType?: string;
}

interface InitiateAuthResponse {
  AuthenticationResult?: {
    AccessToken?: string;
    IdToken?: string;
    RefreshToken?: string;
    ExpiresIn?: number;
    TokenType?: string;
  };
}

interface SignUpResponse {
  UserConfirmed?: boolean;
}

function resolveConfig(): CognitoConfig {
  const region = process.env.COGNITO_REGION?.trim();
  const userPoolId = process.env.COGNITO_USER_POOL_ID?.trim();
  const appClientId = process.env.COGNITO_APP_CLIENT_ID?.trim();

  if (!region || !userPoolId || !appClientId) {
    throw new Error('Cognito web auth is not configured. Set COGNITO_REGION, COGNITO_USER_POOL_ID, and COGNITO_APP_CLIENT_ID.');
  }

  return { region, userPoolId, appClientId };
}

function getEndpoint(config: CognitoConfig): string {
  return `https://cognito-idp.${config.region}.amazonaws.com/`;
}

async function callCognito<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const config = resolveConfig();
  const response = await fetch(getEndpoint(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': target,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    __type?: string;
  } & T;

  if (!response.ok) {
    const detail = payload.message ?? payload.__type ?? `Request failed (${response.status})`;
    throw new Error(detail);
  }

  return payload as T;
}

function normalizeTokens(payload: InitiateAuthResponse): CognitoAuthTokens {
  const auth = payload.AuthenticationResult;
  if (!auth?.AccessToken || !auth.IdToken) {
    throw new Error('Cognito auth response did not include tokens.');
  }

  return {
    accessToken: auth.AccessToken,
    idToken: auth.IdToken,
    refreshToken: auth.RefreshToken,
    expiresIn: auth.ExpiresIn ?? 3600,
    tokenType: auth.TokenType,
  };
}

export async function signInWithPassword(email: string, password: string): Promise<CognitoAuthTokens> {
  const config = resolveConfig();
  const response = await callCognito<InitiateAuthResponse>(
    'AWSCognitoIdentityProviderService.InitiateAuth',
    {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: config.appClientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    }
  );

  return normalizeTokens(response);
}

export async function signUpWithPassword(email: string, password: string): Promise<CognitoAuthTokens> {
  const config = resolveConfig();
  const signUp = await callCognito<SignUpResponse>('AWSCognitoIdentityProviderService.SignUp', {
    ClientId: config.appClientId,
    Username: email,
    Password: password,
    UserAttributes: [{ Name: 'email', Value: email }],
  });

  if (!signUp.UserConfirmed) {
    throw new Error('Account created but not confirmed. Check Cognito auto-confirm configuration.');
  }

  return signInWithPassword(email, password);
}

export async function refreshSession(refreshToken: string): Promise<CognitoAuthTokens> {
  const config = resolveConfig();
  const response = await callCognito<InitiateAuthResponse>(
    'AWSCognitoIdentityProviderService.InitiateAuth',
    {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: config.appClientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    }
  );

  const tokens = normalizeTokens(response);
  return {
    ...tokens,
    refreshToken,
  };
}

export async function globalSignOut(accessToken: string): Promise<void> {
  await callCognito<Record<string, never>>('AWSCognitoIdentityProviderService.GlobalSignOut', {
    AccessToken: accessToken,
  });
}
