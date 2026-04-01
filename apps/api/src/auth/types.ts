import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export interface AuthContext {
  userId: string;
  email?: string;
  scopes: string[];
  tokenUse?: string;
  authProvider?: 'supabase' | 'cognito';
  authSubject?: string;
}

export type AuthVerifier = (event: APIGatewayProxyEventV2) => Promise<AuthContext>;
