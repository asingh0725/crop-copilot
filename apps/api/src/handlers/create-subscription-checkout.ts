import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';
import Stripe from 'stripe';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import type { SubscriptionTier } from '../lib/subscription-plans';
import { getSubscriptionSnapshot } from '../lib/entitlements';
import {
  getStripeClient,
  normalizeStripeSubscriptionStatus,
  resolveCheckoutUrls,
  resolveStripePriceIdForTier,
} from '../lib/stripe-billing';

const CheckoutSchema = z.object({
  tier: z.enum(['grower_free', 'grower', 'grower_pro']),
  successUrl: z.string().max(500).optional(),
  cancelUrl: z.string().max(500).optional(),
});

interface ExistingStripeRow {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
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

async function simulateSubscriptionUpdate(userId: string, tier: SubscriptionTier): Promise<void> {
  const pool = getRuntimePool();
  const period = currentPeriodBounds();
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
      VALUES ($1, $2, 'active', $3, $4, false, NOW(), NOW())
      ON CONFLICT ("userId") DO UPDATE
        SET
          "planId" = EXCLUDED."planId",
          status = 'active',
          "currentPeriodStart" = EXCLUDED."currentPeriodStart",
          "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
          "cancelAtPeriodEnd" = false,
          "updatedAt" = NOW()
    `,
    [userId, tier, period.start, period.end]
  );
}

async function getExistingStripeReferences(userId: string): Promise<ExistingStripeRow> {
  const pool = getRuntimePool();
  const result = await pool.query<ExistingStripeRow>(
    `
      SELECT
        "stripeCustomerId" AS stripe_customer_id,
        "stripeSubscriptionId" AS stripe_subscription_id
      FROM "UserSubscription"
      WHERE "userId" = $1
      LIMIT 1
    `,
    [userId]
  );

  return (
    result.rows[0] ?? {
      stripe_customer_id: null,
      stripe_subscription_id: null,
    }
  );
}

async function persistStripeSubscription(
  userId: string,
  tier: SubscriptionTier,
  customerId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const pool = getRuntimePool();
  await pool.query(
    `
      UPDATE "UserSubscription"
      SET
        "planId" = $2,
        status = $3,
        "stripeCustomerId" = $4,
        "stripeSubscriptionId" = $5,
        "currentPeriodStart" = to_timestamp($6),
        "currentPeriodEnd" = to_timestamp($7),
        "cancelAtPeriodEnd" = $8,
        "updatedAt" = NOW()
      WHERE "userId" = $1
    `,
    [
      userId,
      tier,
      normalizeStripeSubscriptionStatus(subscription.status),
      customerId,
      subscription.id,
      subscription.current_period_start,
      subscription.current_period_end,
      subscription.cancel_at_period_end,
    ]
  );
}

async function persistStripeCustomer(userId: string, customerId: string): Promise<void> {
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

async function resolveStripeCustomerId(
  stripe: Stripe,
  userId: string,
  existingCustomerId: string | null
): Promise<string> {
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const customer = await stripe.customers.create({
    metadata: {
      userId,
    },
  });

  await persistStripeCustomer(userId, customer.id);
  return customer.id;
}

export function buildCreateSubscriptionCheckoutHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    let payload: z.infer<typeof CheckoutSchema>;

    try {
      payload = CheckoutSchema.parse(parseJsonBody<unknown>(event.body));
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

    const simulationDefault =
      (process.env.CROP_ENV ?? '').trim().toLowerCase() === 'prod' ? 'false' : 'true';
    const allowSimulation =
      (process.env.ALLOW_BILLING_SIMULATION ?? simulationDefault).trim().toLowerCase() ===
      'true';

    const { successUrl, cancelUrl } = resolveCheckoutUrls(
      event,
      payload.successUrl,
      payload.cancelUrl
    );

    const stripe = getStripeClient();

    if (!stripe && allowSimulation) {
      await simulateSubscriptionUpdate(auth.userId, payload.tier);
      return jsonResponse(
        {
          mode: 'simulation',
          checkoutUrl: successUrl,
          subscription: {
            tier: payload.tier,
            status: 'active',
          },
        },
        { statusCode: 200 }
      );
    }

    if (!stripe) {
      return jsonResponse(
        {
          error: {
            code: 'CONFIGURATION_ERROR',
            message: 'Stripe billing is not fully configured for this plan',
          },
        },
        { statusCode: 503 }
      );
    }

    let priceId: string | null = null;
    try {
      priceId = await resolveStripePriceIdForTier(stripe, payload.tier);
    } catch (error) {
      console.error('Failed to resolve Stripe price for subscription tier', {
        userId: auth.userId,
        tier: payload.tier,
        error: (error as Error).message,
      });
      return jsonResponse(
        {
          error: {
            code: 'CONFIGURATION_ERROR',
            message: 'Unable to resolve Stripe price configuration for this plan',
          },
        },
        { statusCode: 503 }
      );
    }

    if (!priceId) {
      if (allowSimulation) {
        await simulateSubscriptionUpdate(auth.userId, payload.tier);
        return jsonResponse(
          {
            mode: 'simulation',
            checkoutUrl: successUrl,
            subscription: {
              tier: payload.tier,
              status: 'active',
            },
          },
          { statusCode: 200 }
        );
      }

      return jsonResponse(
        {
          error: {
            code: 'CONFIGURATION_ERROR',
            message: 'Stripe billing is not fully configured for this plan',
          },
        },
        { statusCode: 503 }
      );
    }

    await getSubscriptionSnapshot(getRuntimePool(), auth.userId);
    const existing = await getExistingStripeReferences(auth.userId);
    const customerId = await resolveStripeCustomerId(
      stripe,
      auth.userId,
      existing.stripe_customer_id
    );

    try {
      if (existing.stripe_subscription_id) {
        const current = await stripe.subscriptions.retrieve(existing.stripe_subscription_id, {
          expand: ['items.data.price'],
        });

        if (current.status !== 'canceled' && current.items.data.length > 0) {
          const currentItem = current.items.data[0];
          const updated = await stripe.subscriptions.update(current.id, {
            cancel_at_period_end: false,
            proration_behavior: 'create_prorations',
            automatic_tax: { enabled: true },
            items: [
              {
                id: currentItem.id,
                price: priceId,
              },
            ],
            metadata: {
              userId: auth.userId,
              planId: payload.tier,
            },
          });

          await persistStripeSubscription(auth.userId, payload.tier, customerId, updated);
          return jsonResponse(
            {
              mode: 'stripe',
              checkoutUrl: successUrl,
              updatedDirectly: true,
              subscription: {
                tier: payload.tier,
                status: normalizeStripeSubscriptionStatus(updated.status),
              },
            },
            { statusCode: 200 }
          );
        }
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        client_reference_id: auth.userId,
        automatic_tax: {
          enabled: true,
        },
        payment_method_collection: payload.tier === 'grower_free' ? 'if_required' : 'always',
        subscription_data: {
          proration_behavior: 'create_prorations',
          metadata: {
            userId: auth.userId,
            planId: payload.tier,
          },
        },
        metadata: {
          userId: auth.userId,
          planId: payload.tier,
        },
      });

      if (!session.url) {
        throw new Error('Stripe checkout session did not include redirect URL');
      }

      return jsonResponse(
        {
          mode: 'stripe',
          checkoutUrl: session.url,
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('Failed to create Stripe checkout session', {
        userId: auth.userId,
        tier: payload.tier,
        error: (error as Error).message,
      });

      return jsonResponse(
        {
          error: {
            code: 'STRIPE_CHECKOUT_FAILED',
            message: 'Failed to create Stripe checkout session',
          },
        },
        { statusCode: 502 }
      );
    }
  }, verifier);
}

export const handler = buildCreateSubscriptionCheckoutHandler();
