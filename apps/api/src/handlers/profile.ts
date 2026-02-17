import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

const ProfilePayloadSchema = z.object({
  location: z.string().optional().nullable(),
  farmSize: z
    .enum(['hobby', 'small', 'medium', 'large', 'commercial'])
    .optional()
    .nullable(),
  cropsOfInterest: z.array(z.string()).optional().nullable(),
  experienceLevel: z
    .enum(['beginner', 'intermediate', 'advanced', 'professional'])
    .optional()
    .nullable(),
});

interface ProfileRow {
  user_id: string;
  location: string | null;
  farm_size: string | null;
  crops_of_interest: string[] | null;
  experience_level: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

let profilePool: Pool | null = null;

function getProfilePool(): Pool {
  if (!profilePool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for profile operations');
    }

    profilePool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: 4,
      ssl: resolvePoolSslConfig(),
    });
  }

  return profilePool;
}

function toIsoString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString();
}

function toProfileResponse(row: ProfileRow) {
  return {
    userId: row.user_id,
    location: row.location,
    farmSize: row.farm_size,
    cropsOfInterest: row.crops_of_interest ?? [],
    experienceLevel: row.experience_level,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function resolveUserEmail(userId: string, email: string | undefined): string {
  if (email && email.includes('@')) {
    return email.toLowerCase();
  }

  return `${userId}@user.cropcopilot.local`;
}

async function getExistingProfile(pool: Pool, userId: string): Promise<ProfileRow | null> {
  const existing = await pool.query<ProfileRow>(
    `
      SELECT
        "userId" AS user_id,
        location,
        "farmSize" AS farm_size,
        "cropsOfInterest" AS crops_of_interest,
        "experienceLevel" AS experience_level,
        "createdAt" AS created_at,
        "updatedAt" AS updated_at
      FROM "UserProfile"
      WHERE "userId" = $1
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `,
    [userId]
  );

  if (existing.rows.length === 0) {
    return null;
  }

  return existing.rows[0];
}

async function saveProfile(
  pool: Pool,
  userId: string,
  email: string | undefined,
  payload: z.infer<typeof ProfilePayloadSchema>
): Promise<ProfileRow> {
  await pool.query(
    `
      INSERT INTO "User" (
        id,
        email,
        "createdAt",
        "updatedAt"
      )
      VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE
      SET
        email = CASE
          WHEN "User".email = '' THEN EXCLUDED.email
          ELSE "User".email
        END,
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    [userId, resolveUserEmail(userId, email)]
  );

  const normalizedPayload = {
    location: normalizeOptionalString(payload.location),
    farmSize: normalizeOptionalString(payload.farmSize),
    cropsOfInterest: payload.cropsOfInterest ?? [],
    experienceLevel: normalizeOptionalString(payload.experienceLevel),
  };

  const updated = await pool.query<ProfileRow>(
    `
      UPDATE "UserProfile"
      SET
        location = $2,
        "farmSize" = $3,
        "cropsOfInterest" = $4,
        "experienceLevel" = $5,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = $1
      RETURNING
        "userId" AS user_id,
        location,
        "farmSize" AS farm_size,
        "cropsOfInterest" AS crops_of_interest,
        "experienceLevel" AS experience_level,
        "createdAt" AS created_at,
        "updatedAt" AS updated_at
    `,
    [
      userId,
      normalizedPayload.location,
      normalizedPayload.farmSize,
      normalizedPayload.cropsOfInterest,
      normalizedPayload.experienceLevel,
    ]
  );

  if (updated.rows.length > 0) {
    return updated.rows[0];
  }

  const created = await pool.query<ProfileRow>(
    `
      INSERT INTO "UserProfile" (
        id,
        "userId",
        location,
        "farmSize",
        "cropsOfInterest",
        "experienceLevel",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING
        "userId" AS user_id,
        location,
        "farmSize" AS farm_size,
        "cropsOfInterest" AS crops_of_interest,
        "experienceLevel" AS experience_level,
        "createdAt" AS created_at,
        "updatedAt" AS updated_at
    `,
    [
      randomUUID(),
      userId,
      normalizedPayload.location,
      normalizedPayload.farmSize,
      normalizedPayload.cropsOfInterest,
      normalizedPayload.experienceLevel,
    ]
  );

  return created.rows[0];
}

export function buildProfileHandler(verifier?: AuthVerifier): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    const pool = getProfilePool();

    if (event.requestContext.http.method === 'GET') {
      try {
        const profile = await getExistingProfile(pool, auth.userId);
        if (!profile) {
          return jsonResponse(
            {
              error: {
                code: 'NOT_FOUND',
                message: 'Profile not found',
              },
            },
            { statusCode: 404 }
          );
        }

        return jsonResponse({ profile: toProfileResponse(profile) }, { statusCode: 200 });
      } catch (error) {
        console.error('Failed to get profile', {
          userId: auth.userId,
          error: (error as Error).message,
        });

        return jsonResponse(
          {
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Internal server error',
            },
          },
          { statusCode: 500 }
        );
      }
    }

    if (event.requestContext.http.method === 'PUT') {
      let payload: z.infer<typeof ProfilePayloadSchema>;
      try {
        payload = ProfilePayloadSchema.parse(parseJsonBody<unknown>(event.body));
      } catch (error) {
        if (error instanceof z.ZodError || isBadRequestError(error)) {
          const errorMessage =
            error instanceof Error ? error.message : 'Invalid request payload';
          return jsonResponse(
            {
              error: {
                code: 'BAD_REQUEST',
                message: errorMessage,
              },
            },
            { statusCode: 400 }
          );
        }

        return jsonResponse(
          {
            error: {
              code: 'BAD_REQUEST',
              message: 'Invalid request payload',
            },
          },
          { statusCode: 400 }
        );
      }

      try {
        const profile = await saveProfile(pool, auth.userId, auth.email, payload);
        return jsonResponse({ profile: toProfileResponse(profile) }, { statusCode: 200 });
      } catch (error) {
        console.error('Failed to update profile', {
          userId: auth.userId,
          error: (error as Error).message,
        });

        return jsonResponse(
          {
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Internal server error',
            },
          },
          { statusCode: 500 }
        );
      }
    }

    return jsonResponse(
      {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Method not allowed',
        },
      },
      { statusCode: 405 }
    );
  }, verifier);
}

export const handler = buildProfileHandler();
