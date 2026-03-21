import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { CreateInputCommandSchema } from '@crop-copilot/contracts';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { getRecommendationStore, type EnqueueInputResult } from '../lib/store';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import {
  getRecommendationQueue,
  type RecommendationQueue,
} from '../queue/recommendation-queue';
import { getRuntimePool } from '../lib/runtime-pool';
import { checkRecommendationAllowance, getSubscriptionSnapshot } from '../lib/entitlements';
import { DEFAULT_SUBSCRIPTION_TIER, type SubscriptionTier } from '../lib/subscription-plans';

function isValidationError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'ZodError';
}

function normalizeTraceId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 128) {
    return undefined;
  }

  return trimmed;
}

type ParsedCreateInputCommand = ReturnType<typeof CreateInputCommandSchema.parse>;

function sanitizePlanningInputsByTier(
  command: ParsedCreateInputCommand,
  tier: SubscriptionTier
): ParsedCreateInputCommand {
  const allowsPlanning = tier === 'grower' || tier === 'grower_pro';
  const allowsPreciseLocation = tier === 'grower_pro';

  return {
    ...command,
    fieldAcreage: allowsPlanning ? command.fieldAcreage ?? null : null,
    plannedApplicationDate: allowsPlanning ? command.plannedApplicationDate ?? null : null,
    fieldLatitude: allowsPreciseLocation ? command.fieldLatitude ?? null : null,
    fieldLongitude: allowsPreciseLocation ? command.fieldLongitude ?? null : null,
  };
}

export function buildCreateInputHandler(
  verifier?: AuthVerifier,
  queue: RecommendationQueue = getRecommendationQueue()
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    const traceId = normalizeTraceId(
      event.requestContext?.requestId ??
        event.headers?.['x-request-id'] ??
        event.headers?.['X-Request-Id']
    );

    let command: ReturnType<typeof CreateInputCommandSchema.parse>;
    try {
      const payload = parseJsonBody<unknown>(event.body);
      command = CreateInputCommandSchema.parse(payload);
    } catch (error) {
      if (isValidationError(error) || isBadRequestError(error)) {
        return jsonResponse(
          {
            error: {
              code: 'BAD_REQUEST',
              message: error.message,
            },
          },
          { statusCode: 400 }
        );
      }

      console.error('Failed to parse create-input request', error);

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

    let subscriptionTier: SubscriptionTier = DEFAULT_SUBSCRIPTION_TIER;
    try {
      const subscription = await getSubscriptionSnapshot(getRuntimePool(), auth.userId);
      subscriptionTier = subscription.planId;
    } catch (error) {
      console.warn('Falling back to default tier for create-input field gating', {
        userId: auth.userId,
        error: (error as Error).message,
      });
    }
    command = sanitizePlanningInputsByTier(command, subscriptionTier);

    let enqueueResponse: EnqueueInputResult;

    if ((process.env.ENABLE_USAGE_GUARD ?? 'false').toLowerCase() === 'true') {
      try {
        const allowance = await checkRecommendationAllowance(getRuntimePool(), auth.userId);
        if (!allowance.allowed) {
          return jsonResponse(
            {
              error: {
                code: 'USAGE_LIMIT_REACHED',
                message: allowance.reason ?? 'Monthly recommendation limit reached',
              },
              usage: allowance.snapshot,
            },
            { statusCode: 402 }
          );
        }
      } catch (error) {
        console.error('Failed to evaluate usage guard for create-input', {
          userId: auth.userId,
          error: (error as Error).message,
        });
      }
    }

    try {
      enqueueResponse = await getRecommendationStore().enqueueInput(auth.userId, command, {
        email: auth.email,
      });
    } catch (error) {
      console.error('Failed to persist recommendation command', error);

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

    if (enqueueResponse.wasCreated) {
      try {
        await queue.publishRecommendationJob({
          messageType: 'recommendation.job.requested',
          messageVersion: '1',
          requestedAt: new Date().toISOString(),
          traceId,
          userId: auth.userId,
          inputId: enqueueResponse.inputId,
          jobId: enqueueResponse.jobId,
        });
      } catch (error) {
        return jsonResponse(
          {
            error: {
              code: 'PIPELINE_ENQUEUE_FAILED',
              message: (error as Error).message,
            },
          },
          { statusCode: 500 }
        );
      }
    }

    return jsonResponse(
      {
        inputId: enqueueResponse.inputId,
        jobId: enqueueResponse.jobId,
        status: enqueueResponse.status,
        acceptedAt: enqueueResponse.acceptedAt,
      },
      { statusCode: 202 }
    );
  }, verifier);
}

export const handler = buildCreateInputHandler();
