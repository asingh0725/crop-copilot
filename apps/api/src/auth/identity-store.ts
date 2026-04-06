import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { AuthError } from './errors';
import type { AuthContext } from './types';

export type AuthProvider = 'supabase' | 'cognito' | 'local';

export interface VerifiedIdentity {
  provider: AuthProvider;
  subject: string;
  email?: string;
  scopes?: string[];
  tokenUse?: string;
}

interface AuthIdentityRow {
  user_id: string;
  email: string | null;
}

interface UserRow {
  id: string;
  email: string | null;
}

interface Queryable {
  query: Pool['query'];
}

let authIdentityPool: Pool | null = null;

function normalizeEmail(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) {
    return undefined;
  }

  return trimmed;
}

function fallbackEmail(provider: AuthProvider, subject: string): string {
  return `${provider}.${subject}@user.cropcopilot.local`;
}

function getIdentityPool(): Pool {
  if (!authIdentityPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new AuthError(
        'DATABASE_URL is required to resolve authenticated users.',
        500,
        'AUTH_CONFIG_ERROR'
      );
    }

    authIdentityPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: 4,
      ssl: resolvePoolSslConfig(),
    });
  }

  return authIdentityPool;
}

async function getExistingIdentity(
  client: Queryable,
  provider: AuthProvider,
  subject: string
): Promise<AuthIdentityRow | null> {
  const result = await client.query<AuthIdentityRow>(
    `
      SELECT ai."userId" AS user_id, u.email
      FROM "AuthIdentity" ai
      JOIN "User" u ON u.id = ai."userId"
      WHERE ai.provider = $1
        AND ai.subject = $2
      LIMIT 1
    `,
    [provider, subject]
  );

  return result.rows[0] ?? null;
}

async function getUserByEmail(client: Queryable, email: string): Promise<UserRow | null> {
  const result = await client.query<UserRow>(
    `
      SELECT id, email
      FROM "User"
      WHERE LOWER(email) = LOWER($1)
      ORDER BY "createdAt" ASC
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] ?? null;
}

async function getUserById(client: Queryable, userId: string): Promise<UserRow | null> {
  const result = await client.query<UserRow>(
    `
      SELECT id, email
      FROM "User"
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

async function ensureUser(
  client: Queryable,
  userId: string,
  provider: AuthProvider,
  email: string | undefined
): Promise<UserRow> {
  const resolvedEmail = email ?? fallbackEmail(provider, userId);

  const result = await client.query<UserRow>(
    `
      INSERT INTO "User" (id, email, "createdAt", "updatedAt")
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE
      SET
        email = CASE
          WHEN "User".email IS NULL OR "User".email = '' OR "User".email LIKE '%@user.cropcopilot.local'
            THEN EXCLUDED.email
          ELSE "User".email
        END,
        "updatedAt" = NOW()
      RETURNING id, email
    `,
    [userId, resolvedEmail]
  );

  return result.rows[0];
}

async function upsertIdentity(
  client: Queryable,
  userId: string,
  provider: AuthProvider,
  subject: string,
  email: string | undefined
): Promise<void> {
  await client.query(
    `
      INSERT INTO "AuthIdentity" (
        id,
        "userId",
        provider,
        subject,
        email,
        metadata,
        "lastUsedAt",
        "createdAt",
        "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, NOW(), NOW(), NOW())
      ON CONFLICT (provider, subject) DO UPDATE
      SET
        "userId" = EXCLUDED."userId",
        email = COALESCE(EXCLUDED.email, "AuthIdentity".email),
        "lastUsedAt" = NOW(),
        "updatedAt" = NOW()
    `,
    [randomUUID(), userId, provider, subject, email ?? null]
  );
}

export async function resolveAuthenticatedUser(
  identity: VerifiedIdentity,
  client?: PoolClient
): Promise<AuthContext> {
  const normalizedEmail = normalizeEmail(identity.email);
  const pool = client ? null : getIdentityPool();
  const executor = client ?? pool!;

  const run = async (db: Queryable): Promise<AuthContext> => {
    const existingIdentity = await getExistingIdentity(db, identity.provider, identity.subject);
    if (existingIdentity) {
      await upsertIdentity(
        db,
        existingIdentity.user_id,
        identity.provider,
        identity.subject,
        normalizedEmail ?? existingIdentity.email ?? undefined
      );

      return {
        userId: existingIdentity.user_id,
        email: normalizedEmail ?? existingIdentity.email ?? undefined,
        scopes: identity.scopes ?? [],
        tokenUse: identity.tokenUse,
        authProvider: identity.provider,
        authSubject: identity.subject,
      };
    }

    let user = normalizedEmail ? await getUserByEmail(db, normalizedEmail) : null;

    if (!user && identity.provider === 'supabase') {
      user = await getUserById(db, identity.subject);
    }

    if (!user) {
      const newUserId = identity.provider === 'supabase' ? identity.subject : randomUUID();
      user = await ensureUser(db, newUserId, identity.provider, normalizedEmail);
    } else if (normalizedEmail && user.email !== normalizedEmail) {
      user = await ensureUser(db, user.id, identity.provider, normalizedEmail);
    }

    await upsertIdentity(db, user.id, identity.provider, identity.subject, normalizedEmail);

    return {
      userId: user.id,
      email: normalizedEmail ?? user.email ?? undefined,
      scopes: identity.scopes ?? [],
      tokenUse: identity.tokenUse,
      authProvider: identity.provider,
      authSubject: identity.subject,
    };
  };

  if (client) {
    return run(executor);
  }

  const pooledClient = await pool!.connect();
  try {
    await pooledClient.query('BEGIN');
    const authContext = await run(pooledClient);
    await pooledClient.query('COMMIT');
    return authContext;
  } catch (error) {
    await pooledClient.query('ROLLBACK').catch(() => undefined);

    if ((error as { code?: string }).code === '42P01') {
      throw new AuthError(
        'Auth identity tables are missing. Apply the latest database migrations before enabling Cognito auth.',
        500,
        'AUTH_CONFIG_ERROR'
      );
    }

    throw error;
  } finally {
    pooledClient.release();
  }
}
