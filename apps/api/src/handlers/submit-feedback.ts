import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import type { AuthVerifier } from '../auth/types';
import { withAuth } from '../auth/with-auth';
import {
  type BadRequestError,
  isBadRequestError,
  jsonResponse,
  parseJsonBody,
} from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { processLearningSignal } from '../learning/feedback-learning';

interface SubmitFeedbackPayload {
  recommendationId: string;
  stage?: FeedbackStage;
  helpful?: boolean;
  rating?: number;
  accuracy?: number;
  comments?: string;
  issues?: string[];
  outcomeApplied?: boolean;
  outcomeSuccess?: boolean;
  outcomeNotes?: string;
}

interface FeedbackRow {
  id: string;
  recommendation_id: string;
  user_id: string;
  helpful: boolean | null;
  rating: number | null;
  accuracy: number | null;
  comments: string | null;
  issues: unknown;
  detailed_completed_at: Date | null;
  outcome_applied: boolean | null;
  outcome_success: boolean | null;
  outcome_notes: string | null;
  outcome_reported: boolean;
  created_at: Date;
  updated_at: Date;
}

interface RecommendationOwnerRow {
  user_id: string;
}

type FeedbackStage = 'basic' | 'detailed' | 'outcome';

interface FeedbackSubmitter {
  (userId: string, payload: SubmitFeedbackPayload): Promise<{
    success: true;
    feedback: ReturnType<typeof toFeedbackResponse>;
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

function parseSubmitFeedbackPayload(input: unknown): SubmitFeedbackPayload {
  if (!input || typeof input !== 'object') {
    throw new Error('Request body must be a JSON object');
  }

  const payload = input as Record<string, unknown>;
  const recommendationId = normalizeRequiredString(
    payload.recommendationId,
    'recommendationId is required'
  );
  const stage = normalizeOptionalStage(payload.stage);

  const helpful = normalizeOptionalBoolean(payload.helpful, 'helpful');
  const rating = normalizeOptionalRating(payload.rating, 'rating');
  const accuracy = normalizeOptionalRating(payload.accuracy, 'accuracy');
  const comments = normalizeOptionalString(payload.comments, 'comments', 4000);
  const issues = normalizeOptionalStringArray(payload.issues, 'issues', 40, 180);
  const outcomeApplied = normalizeOptionalBoolean(payload.outcomeApplied, 'outcomeApplied');
  const outcomeSuccess = normalizeOptionalBoolean(payload.outcomeSuccess, 'outcomeSuccess');
  const outcomeNotes = normalizeOptionalString(payload.outcomeNotes, 'outcomeNotes', 4000);

  return {
    recommendationId,
    stage,
    helpful,
    rating,
    accuracy,
    comments,
    issues,
    outcomeApplied,
    outcomeSuccess,
    outcomeNotes,
  };
}

async function submitFeedbackToDatabase(
  userId: string,
  payload: SubmitFeedbackPayload
): Promise<{ success: true; feedback: ReturnType<typeof toFeedbackResponse> }> {
  const pool = resolveFeedbackPool();
  const recommendation = await pool.query<RecommendationOwnerRow>(
    `
      SELECT "userId" AS user_id
      FROM "Recommendation"
      WHERE id = $1
      LIMIT 1
    `,
    [payload.recommendationId]
  );

  if (recommendation.rows.length === 0) {
    throw new FeedbackNotFoundError();
  }
  if (recommendation.rows[0].user_id !== userId) {
    throw new FeedbackForbiddenError();
  }

  const existingFeedback = await pool.query<FeedbackRow>(
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
        "detailedCompletedAt" AS detailed_completed_at,
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
    [payload.recommendationId]
  );

  const previous = existingFeedback.rows[0];
  const isDetailedSubmission =
    payload.stage === 'detailed' ||
    payload.accuracy !== undefined ||
    (payload.issues !== undefined && payload.issues.length > 0);

  const detailedCompletedAt =
    isDetailedSubmission
      ? new Date()
      : previous?.detailed_completed_at ?? null;
  const merged = {
    helpful: payload.helpful ?? previous?.helpful ?? null,
    rating: payload.rating ?? previous?.rating ?? null,
    accuracy: payload.accuracy ?? previous?.accuracy ?? null,
    comments: payload.comments ?? previous?.comments ?? null,
    issues: payload.issues ?? normalizeIssues(previous?.issues),
    detailedCompletedAt,
    outcomeApplied: payload.outcomeApplied ?? previous?.outcome_applied ?? null,
    outcomeSuccess: payload.outcomeSuccess ?? previous?.outcome_success ?? null,
    outcomeNotes: payload.outcomeNotes ?? previous?.outcome_notes ?? null,
    outcomeReported:
      payload.outcomeSuccess !== undefined ? true : previous?.outcome_reported ?? false,
  };

  const upserted = await pool.query<FeedbackRow>(
    `
      INSERT INTO "Feedback" (
        id,
        "userId",
        "recommendationId",
        helpful,
        rating,
        accuracy,
        comments,
        issues,
        "detailedCompletedAt",
        "outcomeApplied",
        "outcomeSuccess",
        "outcomeNotes",
        "outcomeReported",
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
        $7,
        $8::jsonb,
        $9,
        $10,
        $11,
        $12,
        $13,
        NOW(),
        NOW()
      )
      ON CONFLICT ("recommendationId") DO UPDATE
        SET
          helpful = EXCLUDED.helpful,
          rating = EXCLUDED.rating,
          accuracy = EXCLUDED.accuracy,
          comments = EXCLUDED.comments,
          issues = EXCLUDED.issues,
          "detailedCompletedAt" = EXCLUDED."detailedCompletedAt",
          "outcomeApplied" = EXCLUDED."outcomeApplied",
          "outcomeSuccess" = EXCLUDED."outcomeSuccess",
          "outcomeNotes" = EXCLUDED."outcomeNotes",
          "outcomeReported" = EXCLUDED."outcomeReported",
          "updatedAt" = NOW()
      RETURNING
        id,
        "recommendationId" AS recommendation_id,
        "userId" AS user_id,
        helpful,
        rating,
        accuracy,
        comments,
        issues,
        "detailedCompletedAt" AS detailed_completed_at,
        "outcomeApplied" AS outcome_applied,
        "outcomeSuccess" AS outcome_success,
        "outcomeNotes" AS outcome_notes,
        "outcomeReported" AS outcome_reported,
        "createdAt" AS created_at,
        "updatedAt" AS updated_at
    `,
    [
      previous?.id ?? randomUUID(),
      userId,
      payload.recommendationId,
      merged.helpful,
      merged.rating,
      merged.accuracy,
      merged.comments,
      JSON.stringify(merged.issues),
      merged.detailedCompletedAt,
      merged.outcomeApplied,
      merged.outcomeSuccess,
      merged.outcomeNotes,
      merged.outcomeReported,
    ]
  );

  try {
    await processLearningSignal(pool, {
      recommendationId: payload.recommendationId,
      helpful: payload.helpful,
      rating: payload.rating,
      accuracy: payload.accuracy,
      outcomeSuccess: payload.outcomeSuccess,
    });
  } catch (error) {
    console.error('Failed to process feedback learning signal', {
      recommendationId: payload.recommendationId,
      error: (error as Error).message,
    });
  }

  return {
    success: true,
    feedback: toFeedbackResponse(upserted.rows[0]),
  };
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
    detailedCompletedAt: row.detailed_completed_at?.toISOString() ?? null,
    outcomeApplied: row.outcome_applied,
    outcomeSuccess: row.outcome_success,
    outcomeNotes: row.outcome_notes,
    outcomeReported: row.outcome_reported,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function normalizeIssues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function normalizeRequiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }

  return value.trim();
}

function normalizeOptionalStage(value: unknown): FeedbackStage | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'basic' || value === 'detailed' || value === 'outcome') {
    return value;
  }

  throw new Error('stage must be one of: basic, detailed, outcome');
}

function normalizeOptionalString(
  value: unknown,
  field: string,
  maxLength: number
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${field} exceeds max length of ${maxLength}`);
  }

  return trimmed;
}

function normalizeOptionalStringArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxItemLength: number
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of strings`);
  }
  if (value.length > maxItems) {
    throw new Error(`${field} must have ${maxItems} items or fewer`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`${field}[${index}] must be a string`);
    }

    const trimmed = entry.trim();
    if (trimmed.length > maxItemLength) {
      throw new Error(`${field}[${index}] exceeds max length of ${maxItemLength}`);
    }

    return trimmed;
  });
}

function normalizeOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`);
  }

  return value;
}

function normalizeOptionalRating(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }
  if (value < 1 || value > 5) {
    throw new Error(`${field} must be between 1 and 5`);
  }

  return Math.round(value);
}

export function buildSubmitFeedbackHandler(
  verifier?: AuthVerifier,
  submitFeedback: FeedbackSubmitter = submitFeedbackToDatabase
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    let payload: SubmitFeedbackPayload;
    try {
      const body = parseJsonBody<unknown>(event.body);
      payload = parseSubmitFeedbackPayload(body);
    } catch (error) {
      if (
        isBadRequestError(error) ||
        (error instanceof Error && error.name === 'SyntaxError')
      ) {
        return jsonResponse(
          {
            error: {
              code: 'BAD_REQUEST',
              message: (error as BadRequestError).message,
            },
          },
          { statusCode: 400 }
        );
      }

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
      const result = await submitFeedback(auth.userId, payload);
      return jsonResponse(result, { statusCode: 201 });
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

      console.error('Failed to submit feedback', error);
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

export const handler = buildSubmitFeedbackHandler();
