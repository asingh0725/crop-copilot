import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import type { SubscriptionTier } from '../lib/subscription-plans';
import { getSubscriptionSnapshot, getUsageSnapshot } from '../lib/entitlements';
import { getPushEventPublisher } from '../notifications/push-events';

const AdminSetSubscriptionSchema = z.object({
  tier: z.enum(['grower_free', 'grower', 'grower_pro']),
  userId: z.string().uuid().optional(),
  status: z.enum(['active', 'trialing', 'past_due', 'canceled']).default('active'),
  resetUsage: z.boolean().optional(),
});

function parseCsvList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAdmin(auth: { userId: string; email?: string }): boolean {
  const adminUserIds = parseCsvList(process.env.ADMIN_USER_IDS);
  const adminEmails = parseCsvList(process.env.ADMIN_EMAILS);

  if (adminUserIds.length === 0 && adminEmails.length === 0) {
    return true;
  }

  if (adminUserIds.includes(auth.userId)) {
    return true;
  }

  if (auth.email && adminEmails.includes(auth.email)) {
    return true;
  }

  return false;
}

function currentPeriodBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

async function emitSubscriptionUpdatedEvent(args: {
  userId: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  tier: SubscriptionTier;
  periodStart: string;
  periodEnd: string;
}): Promise<void> {
  try {
    await getPushEventPublisher().publishSubscriptionUpdated({
      eventType: 'subscription.updated',
      eventVersion: '1',
      occurredAt: new Date().toISOString(),
      userId: args.userId,
      status: args.status,
      tier: args.tier,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
    });
  } catch (error) {
    console.warn('Failed to publish subscription.updated for admin override', {
      userId: args.userId,
      tier: args.tier,
      status: args.status,
      error: (error as Error).message,
    });
  }
}

export function buildAdminSetSubscriptionHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    if (!isAdmin(auth)) {
      return jsonResponse(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
          },
        },
        { statusCode: 403 }
      );
    }

    let payload: z.infer<typeof AdminSetSubscriptionSchema>;

    try {
      payload = AdminSetSubscriptionSchema.parse(parseJsonBody<unknown>(event.body));
    } catch (error) {
      if (error instanceof z.ZodError || isBadRequestError(error)) {
        return jsonResponse(
          {
            error: {
              code: 'BAD_REQUEST',
              message: error instanceof Error ? error.message : 'Invalid request payload',
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

    const targetUserId = payload.userId ?? auth.userId;
    const period = currentPeriodBounds();
    const pool = getRuntimePool();

    try {
      await pool.query(
        `
          INSERT INTO "UserSubscription" (
            "userId",
            "planId",
            status,
            "currentPeriodStart",
            "currentPeriodEnd",
            "cancelAtPeriodEnd",
            "createdAt",
            "updatedAt"
          )
          VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())
          ON CONFLICT ("userId") DO UPDATE
            SET
              "planId" = EXCLUDED."planId",
              status = EXCLUDED.status,
              "currentPeriodStart" = EXCLUDED."currentPeriodStart",
              "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
              "cancelAtPeriodEnd" = false,
              "updatedAt" = NOW()
        `,
        [targetUserId, payload.tier, payload.status, period.start, period.end]
      );

      if (payload.resetUsage) {
        const usageMonth = new Date().toISOString().slice(0, 7);
        await pool.query(
          `
            DELETE FROM "UsageLedger"
            WHERE "userId" = $1
              AND "usageMonth" = $2
          `,
          [targetUserId, usageMonth]
        );
      }

      const [subscription, usage] = await Promise.all([
        getSubscriptionSnapshot(pool, targetUserId),
        getUsageSnapshot(pool, targetUserId),
      ]);

      await emitSubscriptionUpdatedEvent({
        userId: targetUserId,
        status: subscription.status,
        tier: subscription.planId,
        periodStart: subscription.periodStart,
        periodEnd: subscription.periodEnd,
      });

      return jsonResponse(
        {
          success: true,
          subscription,
          usage,
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('Failed to override subscription plan', {
        actorUserId: auth.userId,
        targetUserId,
        tier: payload.tier,
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

export const handler = buildAdminSetSubscriptionHandler();
