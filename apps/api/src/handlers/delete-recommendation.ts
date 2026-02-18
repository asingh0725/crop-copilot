import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

interface DeleteRow {
  id: string;
}

let deleteRecommendationPool: Pool | null = null;

function getDeleteRecommendationPool(): Pool {
  if (!deleteRecommendationPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for recommendation deletion');
    }

    deleteRecommendationPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: 4,
      ssl: resolvePoolSslConfig(),
    });
  }

  return deleteRecommendationPool;
}

export function buildDeleteRecommendationHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    const recommendationId = event.pathParameters?.id;
    if (!recommendationId) {
      return jsonResponse(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Recommendation id is required',
          },
        },
        { statusCode: 400 }
      );
    }

    const pool = getDeleteRecommendationPool();

    try {
      const deleted = await pool.query<DeleteRow>(
        `
          DELETE FROM "Recommendation"
          WHERE id = $1
            AND "userId" = $2
          RETURNING id
        `,
        [recommendationId, auth.userId]
      );

      if (deleted.rows.length === 0) {
        return jsonResponse(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Recommendation not found',
            },
          },
          { statusCode: 404 }
        );
      }

      return jsonResponse({ success: true }, { statusCode: 200 });
    } catch (error) {
      console.error('Failed to delete recommendation', {
        recommendationId,
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
  }, verifier);
}

export const handler = buildDeleteRecommendationHandler();
