import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import Stripe from 'stripe';
import { jsonResponse } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import {
  DEFAULT_SUBSCRIPTION_TIER,
  CREDIT_PACKS,
  type SubscriptionTier,
} from '../lib/subscription-plans';
import {
  getStripeClient,
  normalizeStripeSubscriptionStatus,
  preferredUserIdFromCheckoutSession,
  tierFromStripePriceId,
  creditPackFromStripePriceId,
} from '../lib/stripe-billing';
import {
  applyReferralRewards,
  getCreditBalanceUsd,
  grantCreditPackPurchase,
} from '../lib/entitlements';
import { getPushEventPublisher } from '../notifications/push-events';

interface ExistingSubscriptionRow {
  user_id: string;
  plan_id: SubscriptionTier;
}

function asHeaders(
  headers: Record<string, string | undefined> | undefined
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value ?? undefined])
  );
}

function readRawRequestBody(event: Parameters<APIGatewayProxyHandlerV2>[0]): string {
  if (!event.body) {
    return '';
  }
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }
  return event.body;
}

function isPaidTier(tier: SubscriptionTier): boolean {
  return tier === 'grower' || tier === 'grower_pro';
}

function asIsoFromUnix(value: number): string {
  return new Date(value * 1000).toISOString();
}

function resolveTierFromMetadata(value?: string): SubscriptionTier | null {
  if (value === 'grower_free' || value === 'grower' || value === 'grower_pro') {
    return value;
  }
  return null;
}

function resolveTierFromSubscription(
  subscription: Stripe.Subscription,
  existingTier: SubscriptionTier | null
): SubscriptionTier {
  const fromMetadata = resolveTierFromMetadata(subscription.metadata?.planId);
  if (fromMetadata) {
    return fromMetadata;
  }

  const primaryPriceId = subscription.items.data[0]?.price?.id;
  const fromPrice = tierFromStripePriceId(primaryPriceId);
  if (fromPrice) {
    return fromPrice;
  }

  return existingTier ?? DEFAULT_SUBSCRIPTION_TIER;
}

async function resolveExistingSubscription(userId: string): Promise<ExistingSubscriptionRow | null> {
  const pool = getRuntimePool();
  const result = await pool.query<ExistingSubscriptionRow>(
    `
      SELECT
        "userId" AS user_id,
        "planId" AS plan_id
      FROM "UserSubscription"
      WHERE "userId" = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

async function resolveUserIdByStripeCustomerId(customerId: string): Promise<string | null> {
  const pool = getRuntimePool();
  const result = await pool.query<{ user_id: string }>(
    `
      SELECT "userId" AS user_id
      FROM "UserSubscription"
      WHERE "stripeCustomerId" = $1
      LIMIT 1
    `,
    [customerId]
  );

  return result.rows[0]?.user_id ?? null;
}

async function upsertUserSubscriptionFromStripe(args: {
  userId: string;
  tier: SubscriptionTier;
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}): Promise<void> {
  const pool = getRuntimePool();
  await pool.query(
    `
      INSERT INTO "UserSubscription" (
        "userId",
        "planId",
        status,
        "stripeCustomerId",
        "stripeSubscriptionId",
        "currentPeriodStart",
        "currentPeriodEnd",
        "cancelAtPeriodEnd",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        to_timestamp($6),
        to_timestamp($7),
        $8,
        NOW(),
        NOW()
      )
      ON CONFLICT ("userId") DO UPDATE
        SET
          "planId" = EXCLUDED."planId",
          status = EXCLUDED.status,
          "stripeCustomerId" = EXCLUDED."stripeCustomerId",
          "stripeSubscriptionId" = EXCLUDED."stripeSubscriptionId",
          "currentPeriodStart" = EXCLUDED."currentPeriodStart",
          "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
          "cancelAtPeriodEnd" = EXCLUDED."cancelAtPeriodEnd",
          "updatedAt" = NOW()
    `,
    [
      args.userId,
      args.tier,
      args.status,
      args.stripeCustomerId,
      args.stripeSubscriptionId,
      args.currentPeriodStart,
      args.currentPeriodEnd,
      args.cancelAtPeriodEnd,
    ]
  );
}

async function emitSubscriptionUpdated(args: {
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
    console.warn('Failed to publish subscription.updated event', {
      userId: args.userId,
      tier: args.tier,
      status: args.status,
      error: (error as Error).message,
    });
  }
}

async function emitCreditsUpdated(args: {
  userId: string;
  deltaUsd: number;
  reason: string;
  balanceUsd: number;
}): Promise<void> {
  try {
    await getPushEventPublisher().publishCreditsUpdated({
      eventType: 'credits.updated',
      eventVersion: '1',
      occurredAt: new Date().toISOString(),
      userId: args.userId,
      deltaUsd: args.deltaUsd,
      reason: args.reason,
      balanceUsd: args.balanceUsd,
    });
  } catch (error) {
    console.warn('Failed to publish credits.updated event', {
      userId: args.userId,
      reason: args.reason,
      deltaUsd: args.deltaUsd,
      error: (error as Error).message,
    });
  }
}

async function resolveUserIdForSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = subscription.metadata?.userId?.trim();
  if (fromMetadata) {
    return fromMetadata;
  }

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? '';

  if (!customerId) {
    return null;
  }

  return resolveUserIdByStripeCustomerId(customerId);
}

async function processSubscriptionObject(subscription: Stripe.Subscription): Promise<void> {
  const userId = await resolveUserIdForSubscription(subscription);
  if (!userId) {
    console.warn('Stripe webhook subscription could not resolve user id', {
      subscriptionId: subscription.id,
    });
    return;
  }

  const existing = await resolveExistingSubscription(userId);
  const tier = resolveTierFromSubscription(subscription, existing?.plan_id ?? null);
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;

  if (!customerId) {
    console.warn('Stripe webhook subscription missing customer id', {
      subscriptionId: subscription.id,
      userId,
    });
    return;
  }

  const status = normalizeStripeSubscriptionStatus(subscription.status);
  await upsertUserSubscriptionFromStripe({
    userId,
    tier,
    status,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
  });

  await emitSubscriptionUpdated({
    userId,
    status,
    tier,
    periodStart: asIsoFromUnix(subscription.current_period_start),
    periodEnd: asIsoFromUnix(subscription.current_period_end),
  });
}

async function resolveCreditPackIdFromCheckout(
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<keyof typeof CREDIT_PACKS | null> {
  const fromMetadata = session.metadata?.creditPackId;
  if (fromMetadata && fromMetadata in CREDIT_PACKS) {
    return fromMetadata as keyof typeof CREDIT_PACKS;
  }

  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 10,
      expand: ['data.price'],
    });

    for (const item of lineItems.data) {
      const priceId = typeof item.price === 'string' ? item.price : item.price?.id;
      const packId = creditPackFromStripePriceId(priceId);
      if (packId) {
        return packId;
      }
    }
  } catch (error) {
    console.warn('Failed to resolve checkout line items for credit pack', {
      sessionId: session.id,
      error: (error as Error).message,
    });
  }

  return null;
}

async function processCreditPackCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  stripeEventId: string
): Promise<void> {
  if (session.mode !== 'payment' || session.payment_status !== 'paid') {
    return;
  }

  let userId = preferredUserIdFromCheckoutSession(session);
  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id ?? '';
  if (!userId && customerId) {
    userId = await resolveUserIdByStripeCustomerId(customerId);
  }

  if (!userId) {
    console.warn('Credit pack checkout could not resolve user id', {
      sessionId: session.id,
      stripeEventId,
    });
    return;
  }

  const packId = await resolveCreditPackIdFromCheckout(stripe, session);
  if (!packId) {
    return;
  }

  const pool = getRuntimePool();
  await grantCreditPackPurchase(pool, userId, {
    packId,
    checkoutSessionId: session.id,
    stripeEventId,
    paymentIntentId:
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
  });
}

async function processCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  stripeEventId: string
): Promise<void> {
  if (session.mode === 'payment') {
    await processCreditPackCheckoutCompleted(stripe, session, stripeEventId);
    return;
  }

  if (session.mode !== 'subscription') {
    return;
  }

  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id ?? '';
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? '';

  if (!customerId || !subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });

  let userId = preferredUserIdFromCheckoutSession(session);
  if (!userId) {
    userId = await resolveUserIdByStripeCustomerId(customerId);
  }

  if (!userId) {
    return;
  }

  const existing = await resolveExistingSubscription(userId);
  const tier = resolveTierFromSubscription(subscription, existing?.plan_id ?? null);
  const status = normalizeStripeSubscriptionStatus(subscription.status);

  await upsertUserSubscriptionFromStripe({
    userId,
    tier,
    status,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
  });

  await emitSubscriptionUpdated({
    userId,
    status,
    tier,
    periodStart: asIsoFromUnix(subscription.current_period_start),
    periodEnd: asIsoFromUnix(subscription.current_period_end),
  });
}

async function markSubscriptionPastDue(customerId: string, subscriptionId?: string): Promise<void> {
  const userId = await resolveUserIdByStripeCustomerId(customerId);
  if (!userId) {
    return;
  }

  const pool = getRuntimePool();
  const result = await pool.query<{
    plan_id: SubscriptionTier;
    current_period_start: Date;
    current_period_end: Date;
  }>(
    `
      UPDATE "UserSubscription"
      SET
        status = 'past_due',
        "stripeSubscriptionId" = COALESCE($2, "stripeSubscriptionId"),
        "updatedAt" = NOW()
      WHERE "userId" = $1
      RETURNING
        "planId" AS plan_id,
        "currentPeriodStart" AS current_period_start,
        "currentPeriodEnd" AS current_period_end
    `,
    [userId, subscriptionId ?? null]
  );

  const row = result.rows[0];
  if (!row) {
    return;
  }

  await emitSubscriptionUpdated({
    userId,
    tier: row.plan_id,
    status: 'past_due',
    periodStart: row.current_period_start.toISOString(),
    periodEnd: row.current_period_end.toISOString(),
  });
}

async function processReferralCompletionForPaidCycle(customerId: string): Promise<void> {
  const userId = await resolveUserIdByStripeCustomerId(customerId);
  if (!userId) {
    return;
  }

  const existing = await resolveExistingSubscription(userId);
  if (!existing || !isPaidTier(existing.plan_id)) {
    return;
  }

  const pool = getRuntimePool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const referralResult = await client.query<{ id: string }>(
      `
        SELECT id
        FROM "Referral"
        WHERE "referredUserId" = $1
          AND status = 'pending'
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE
      `,
      [userId]
    );

    const referralId = referralResult.rows[0]?.id;
    if (!referralId) {
      await client.query('COMMIT');
      return;
    }

    const updated = await client.query<{ id: string }>(
      `
        UPDATE "Referral"
        SET
          status = 'completed',
          "completedAt" = NOW()
        WHERE id = $1
          AND status = 'pending'
        RETURNING id
      `,
      [referralId]
    );

    if (updated.rows.length === 0) {
      await client.query('COMMIT');
      return;
    }

    const rewards = await applyReferralRewards(client, referralId);
    await client.query('COMMIT');

    for (const reward of rewards) {
      const balanceUsd = await getCreditBalanceUsd(pool, reward.userId);
      await emitCreditsUpdated({
        userId: reward.userId,
        deltaUsd: reward.amountUsd,
        reason: 'referral_reward',
        balanceUsd,
      });
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failures.
    }
    throw error;
  } finally {
    client.release();
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const stripe = getStripeClient();
  if (!stripe) {
    return jsonResponse(
      {
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'Stripe webhook received but STRIPE_SECRET_KEY is not configured',
        },
      },
      { statusCode: 503 }
    );
  }

  const headers = asHeaders(event.headers);
  const signature = headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET ?? process.env.BILLING_WEBHOOK_SECRET;
  if (!endpointSecret) {
    return jsonResponse(
      {
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'Stripe webhook secret is not configured',
        },
      },
      { statusCode: 503 }
    );
  }

  if (!signature) {
    return jsonResponse(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Missing stripe-signature header',
        },
      },
      { statusCode: 403 }
    );
  }

  const rawBody = readRawRequestBody(event);
  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
  } catch (error) {
    return jsonResponse(
      {
        error: {
          code: 'FORBIDDEN',
          message: `Invalid webhook signature: ${(error as Error).message}`,
        },
      },
      { statusCode: 403 }
    );
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await processCheckoutCompleted(
          stripe,
          stripeEvent.data.object as Stripe.Checkout.Session,
          stripeEvent.id
        );
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await processSubscriptionObject(stripeEvent.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : '';
        if (customerId) {
          const subscriptionId =
            typeof invoice.subscription === 'string' ? invoice.subscription : undefined;
          await markSubscriptionPastDue(customerId, subscriptionId);
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = stripeEvent.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : '';
        const billingReason = invoice.billing_reason;

        if (
          customerId &&
          (billingReason === 'subscription_cycle' || billingReason === 'subscription_create')
        ) {
          await processReferralCompletionForPaidCycle(customerId);
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error('Failed to process Stripe webhook event', {
      eventType: stripeEvent.type,
      eventId: stripeEvent.id,
      error: (error as Error).message,
    });

    return jsonResponse(
      {
        error: {
          code: 'WEBHOOK_PROCESSING_FAILED',
          message: 'Webhook event processing failed',
        },
      },
      { statusCode: 500 }
    );
  }

  return jsonResponse({ received: true }, { statusCode: 200 });
};
