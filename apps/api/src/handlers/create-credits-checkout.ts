import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';
import Stripe from 'stripe';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { isBadRequestError, jsonResponse, parseJsonBody } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import { getSubscriptionSnapshot, grantCreditPackPurchase } from '../lib/entitlements';
import { CREDIT_PACKS, type CreditPackId } from '../lib/subscription-plans';
import {
  getStripeClient,
  resolveCheckoutUrls,
  resolveStripePriceIdForCreditPack,
} from '../lib/stripe-billing';

const CreditsCheckoutSchema = z.object({
  packId: z.enum(['pack_10']),
  successUrl: z.string().max(500).optional(),
  cancelUrl: z.string().max(500).optional(),
});

interface ExistingStripeRow {
  stripe_customer_id: string | null;
}

async function getExistingStripeCustomerId(userId: string): Promise<string | null> {
  const pool = getRuntimePool();
  const result = await pool.query<ExistingStripeRow>(
    `
      SELECT
        "stripeCustomerId" AS stripe_customer_id
      FROM "UserSubscription"
      WHERE "userId" = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0]?.stripe_customer_id ?? null;
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

async function grantSimulationCredits(userId: string, packId: CreditPackId): Promise<void> {
  const pool = getRuntimePool();
  await grantCreditPackPurchase(pool, userId, {
    packId,
    checkoutSessionId: `sim-${Date.now()}`,
    stripeEventId: 'simulation',
    paymentIntentId: null,
  });
}

export function buildCreateCreditsCheckoutHandler(verifier?: AuthVerifier): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    let payload: z.infer<typeof CreditsCheckoutSchema>;

    try {
      payload = CreditsCheckoutSchema.parse(parseJsonBody<unknown>(event.body));
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

    const { successUrl, cancelUrl } = resolveCheckoutUrls(
      event,
      payload.successUrl,
      payload.cancelUrl
    );

    const simulationDefault =
      (process.env.CROP_ENV ?? '').trim().toLowerCase() === 'prod' ? 'false' : 'true';
    const allowSimulation =
      (process.env.ALLOW_BILLING_SIMULATION ?? simulationDefault).trim().toLowerCase() ===
      'true';

    const stripe = getStripeClient();

    if (!stripe && allowSimulation) {
      await grantSimulationCredits(auth.userId, payload.packId);
      return jsonResponse(
        {
          mode: 'simulation',
          checkoutUrl: successUrl,
          creditsGrantedUsd: CREDIT_PACKS[payload.packId].creditAmountUsd,
        },
        { statusCode: 200 }
      );
    }

    if (!stripe) {
      return jsonResponse(
        {
          error: {
            code: 'CONFIGURATION_ERROR',
            message: 'Stripe credit packs are not fully configured',
          },
        },
        { statusCode: 503 }
      );
    }

    let priceId: string | null = null;
    try {
      priceId = await resolveStripePriceIdForCreditPack(stripe, payload.packId);
    } catch (error) {
      console.error('Failed to resolve Stripe price for credit pack', {
        userId: auth.userId,
        packId: payload.packId,
        error: (error as Error).message,
      });
      return jsonResponse(
        {
          error: {
            code: 'CONFIGURATION_ERROR',
            message: 'Unable to resolve Stripe price configuration for credit packs',
          },
        },
        { statusCode: 503 }
      );
    }

    if (!priceId) {
      if (allowSimulation) {
        await grantSimulationCredits(auth.userId, payload.packId);
        return jsonResponse(
          {
            mode: 'simulation',
            checkoutUrl: successUrl,
            creditsGrantedUsd: CREDIT_PACKS[payload.packId].creditAmountUsd,
          },
          { statusCode: 200 }
        );
      }

      return jsonResponse(
        {
          error: {
            code: 'CONFIGURATION_ERROR',
            message: 'Stripe credit packs are not fully configured',
          },
        },
        { statusCode: 503 }
      );
    }

    await getSubscriptionSnapshot(getRuntimePool(), auth.userId);
    const existingCustomerId = await getExistingStripeCustomerId(auth.userId);
    const customerId = await resolveStripeCustomerId(stripe, auth.userId, existingCustomerId);
    const pack = CREDIT_PACKS[payload.packId];

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        client_reference_id: auth.userId,
        automatic_tax: {
          enabled: true,
        },
        metadata: {
          userId: auth.userId,
          creditPackId: payload.packId,
          creditAmountUsd: String(pack.creditAmountUsd),
          recommendationCredits: String(pack.recommendationCredits),
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
      console.error('Failed to create Stripe credit pack checkout session', {
        userId: auth.userId,
        packId: payload.packId,
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

export const handler = buildCreateCreditsCheckoutHandler();
