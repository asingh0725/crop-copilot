import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import type { AuthVerifier } from '../auth/types';
import { withAuth } from '../auth/with-auth';
import { jsonResponse } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

interface FeedbackRow {
  id: string;
  recommendation_id: string;
  user_id: string;
  helpful: boolean | null;
  rating: number | null;
  accuracy: number | null;
  comments: string | null;
  issues: unknown;
  outcome_applied: boolean | null;
  outcome_success: boolean | null;
  outcome_notes: string | null;
  outcome_reported: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RecommendationOwnerRow {
  user_id: string;
}

interface FeedbackFetcher {
  (userId: string, recommendationId: string): Promise<{
    feedback: ReturnType<typeof toFeedbackResponse> | null;
  }>;
}

let feedbackPool: Pool | null = null;

function resolveFeedbackPool(): Pool {
  if (!feedbackPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for feedback handling');
    }

    feedbackPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 5),
      ssl: resolvePoolSslConfig(),
    });
  }

  return feedbackPool;
}

class FeedbackNotFoundError extends Error {
  constructor() {
    super('Recommendation not found');
    this.name = 'FeedbackNotFoundError';
  }
}

class FeedbackForbiddenError extends Error {
  constructor() {
    super('You can only provide feedback on your own recommendations');
    this.name = 'FeedbackForbiddenError';
  }
}

function normalizeIssues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
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

function toFeedbackResponse(row: FeedbackRow) {
  return {
    id: row.id,
    recommendationId: row.recommendation_id,
    userId: row.user_id,
    helpful: row.helpful,
    rating: row.rating,
    accuracy: row.accuracy,
    comments: row.comments,
    issues: normalizeIssues(row.issues),
    outcomeApplied: row.outcome_applied,
    outcomeSuccess: row.outcome_success,
    outcomeNotes: row.outcome_notes,
    outcomeReported: row.outcome_reported,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function parseRecommendationId(input: string | undefined): string {
  if (!input || input.trim().length === 0) {
    throw new Error('recommendationId is required');
  }

  return input.trim();
}

async function getFeedbackFromDatabase(
  userId: string,
  recommendationId: string
): Promise<{ feedback: ReturnType<typeof toFeedbackResponse> | null }> {
  const pool = resolveFeedbackPool();
  const recommendation = await pool.query<RecommendationOwnerRow>(
    `
      SELECT "userId" AS user_id
      FROM "Recommendation"
      WHERE id = $1
      LIMIT 1
    `,
    [recommendationId]
  );

  if (recommendation.rows.length === 0) {
    throw new FeedbackNotFoundError();
  }

  if (recommendation.rows[0].user_id !== userId) {
    throw new FeedbackForbiddenError();
  }

  const result = await pool.query<FeedbackRow>(
    `
      SELECT
        id,
        "recommendationId" AS recommendation_id,
        "userId" AS user_id,
        helpful,
        rating,
        accuracy,
        comments,
        issues,
        "outcomeApplied" AS outcome_applied,
        "outcomeSuccess" AS outcome_success,
        "outcomeNotes" AS outcome_notes,
        "outcomeReported" AS outcome_reported,
        "createdAt" AS created_at,
        "updatedAt" AS updated_at
      FROM "Feedback"
      WHERE "recommendationId" = $1
      LIMIT 1
    `,
    [recommendationId]
  );

  if (result.rows.length === 0) {
    return { feedback: null };
  }

  return {
    feedback: toFeedbackResponse(result.rows[0]),
  };
}

export function buildGetFeedbackHandler(
  verifier?: AuthVerifier,
  getFeedback: FeedbackFetcher = getFeedbackFromDatabase
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    let recommendationId: string;
    try {
      recommendationId = parseRecommendationId(event.queryStringParameters?.recommendationId);
    } catch (error) {
      return jsonResponse(
        {
          error: {
            code: 'BAD_REQUEST',
            message: (error as Error).message,
          },
        },
        { statusCode: 400 }
      );
    }

    try {
      const result = await getFeedback(auth.userId, recommendationId);
      return jsonResponse(result, { statusCode: 200 });
    } catch (error) {
      if (error instanceof FeedbackNotFoundError) {
        return jsonResponse(
          {
            error: {
              code: 'NOT_FOUND',
              message: error.message,
            },
          },
          { statusCode: 404 }
        );
      }

      if (error instanceof FeedbackForbiddenError) {
        return jsonResponse(
          {
            error: {
              code: 'FORBIDDEN',
              message: error.message,
            },
          },
          { statusCode: 403 }
        );
      }

      console.error('Failed to fetch feedback', {
        userId: auth.userId,
        recommendationId,
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

export const handler = buildGetFeedbackHandler();
