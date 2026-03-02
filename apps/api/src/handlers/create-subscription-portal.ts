import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import { getSubscriptionSnapshot } from '../lib/entitlements';
import { getStripeClient, resolvePortalReturnUrl } from '../lib/stripe-billing';

const PortalPayloadSchema = z
  .object({
    returnUrl: z.string().max(500).optional(),
  })
  .optional();

interface ExistingStripeRow {
  stripe_customer_id: string | null;
}

async function resolveStripeCustomerId(userId: string): Promise<string | null> {
  const pool = getRuntimePool();
  const result = await pool.query<ExistingStripeRow>(
    `
      SELECT "stripeCustomerId" AS stripe_customer_id
      FROM "UserSubscription"
      WHERE "userId" = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0]?.stripe_customer_id ?? null;
}

async function persistStripeCustomerId(userId: string, customerId: string): Promise<void> {
  const pool = getRuntimePool();
  await pool.query(
    `
      UPDATE "UserSubscription"
      SET
        "stripeCustomerId" = $2,
        "updatedAt" = NOW()
      WHERE "userId" = $1
    `,
    [userId, customerId]
  );
}

export function buildCreateSubscriptionPortalHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    let payload: z.infer<typeof PortalPayloadSchema>;

    try {
      payload = PortalPayloadSchema.parse(event.body ? parseJsonBody<unknown>(event.body) : undefined);
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

    const returnUrl = resolvePortalReturnUrl(
      event,
      payload?.returnUrl ?? process.env.BILLING_PORTAL_RETURN_URL?.trim()
    );

    const simulationDefault =
      (process.env.CROP_ENV ?? '').trim().toLowerCase() === 'prod' ? 'false' : 'true';
    const allowSimulation =
      (process.env.ALLOW_BILLING_SIMULATION ?? simulationDefault).trim().toLowerCase() ===
      'true';

    const stripe = getStripeClient();
    if (!stripe && allowSimulation) {
      return jsonResponse(
        {
          mode: 'simulation',
          portalUrl: returnUrl,
        },
        { statusCode: 200 }
      );
    }

    if (!stripe) {
      return jsonResponse(
        {
          error: {
            code: 'CONFIGURATION_ERROR',
            message: 'Stripe portal is not configured',
          },
        },
        { statusCode: 503 }
      );
    }

    await getSubscriptionSnapshot(getRuntimePool(), auth.userId);
    let customerId = await resolveStripeCustomerId(auth.userId);
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: {
          userId: auth.userId,
        },
      });
      customerId = customer.id;
      await persistStripeCustomerId(auth.userId, customer.id);
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return jsonResponse(
        {
          mode: 'stripe',
          portalUrl: session.url,
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('Failed to create Stripe billing portal session', {
        userId: auth.userId,
        error: (error as Error).message,
      });

      return jsonResponse(
        {
          error: {
            code: 'STRIPE_PORTAL_FAILED',
            message: 'Failed to create Stripe billing portal session',
          },
        },
        { statusCode: 502 }
      );
    }
  }, verifier);
}

export const handler = buildCreateSubscriptionPortalHandler();
