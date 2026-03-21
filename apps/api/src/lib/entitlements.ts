import type { Pool, PoolClient } from 'pg';
import {
  CREDIT_PACKS,
  DEFAULT_SUBSCRIPTION_TIER,
  DETAILED_FEEDBACK_REWARD_CAP_USD,
  DETAILED_FEEDBACK_REWARD_USD,
  OVERAGE_RECOMMENDATION_PRICE_USD,
  REFERRAL_REWARD_USD,
  SIGNUP_BONUS_USD,
  SUBSCRIPTION_PLANS,
  type CreditPackId,
  type SubscriptionTier,
  isProTier,
} from './subscription-plans';
import { getStripeClient } from './stripe-billing';
import { getPushEventPublisher } from '../notifications/push-events';

export interface SubscriptionSnapshot {
  userId: string;
  planId: SubscriptionTier;
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  includedRecommendations: number;
  periodStart: string;
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface UsageSnapshot {
  month: string;
  usedRecommendations: number;
  includedRecommendations: number;
  creditsBalanceUsd: number;
  overagePriceUsd: number;
}

export interface RecommendationAllowance {
  allowed: boolean;
  reason?: string;
  snapshot: UsageSnapshot;
}

interface SubscriptionRow {
  plan_id: SubscriptionTier;
  status: SubscriptionSnapshot['status'];
  included_recommendations: number;
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end: boolean;
}

interface CountRow {
  count: string;
}

interface CreditBalanceRow {
  balance: string | null;
}

export interface ReferralRewardGrant {
  userId: string;
  amountUsd: number;
  balanceUsd: number;
}

export interface AutoReloadConfig {
  enabled: boolean;
  thresholdUsd: number;
  reloadPackId: CreditPackId;
  monthlyLimitUsd: number;
}

interface AutoReloadConfigRow {
  enabled: boolean;
  threshold_usd: string;
  reload_pack_id: string;
  monthly_limit_usd: string;
}

interface AutoReloadAttemptResult {
  attempted: boolean;
  success?: boolean;
  reason?: string;
}

function getMonthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

function startOfMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
}

function endOfMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0));
}

function toNumber(value: string | null | undefined, fallback = 0): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

async function emitCreditsUpdatedEvent(
  userId: string,
  deltaUsd: number,
  reason: string,
  balanceUsd: number
): Promise<void> {
  try {
    await getPushEventPublisher().publishCreditsUpdated({
      eventType: 'credits.updated',
      eventVersion: '1',
      occurredAt: new Date().toISOString(),
      userId,
      deltaUsd: roundMoney(deltaUsd),
      reason: reason.slice(0, 120),
      balanceUsd: roundMoney(balanceUsd),
    });
  } catch (error) {
    console.warn('Failed to publish credits.updated event', {
      userId,
      reason,
      deltaUsd,
      error: (error as Error).message,
    });
  }
}

async function ensureUserSubscription(pool: Pool, userId: string): Promise<void> {
  const now = new Date();
  const periodStart = startOfMonth(now);
  const periodEnd = endOfMonth(now);
  const result = await pool.query<{ id: string }>(
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
      ON CONFLICT ("userId") DO NOTHING
      RETURNING "userId" AS id
    `,
    [userId, DEFAULT_SUBSCRIPTION_TIER, periodStart.toISOString(), periodEnd.toISOString()]
  );

  // New user — grant signup bonus (idempotent internally)
  if (result.rows.length > 0) {
    await grantSignupBonus(pool, userId);
  }
}

export async function getSubscriptionSnapshot(
  pool: Pool,
  userId: string
): Promise<SubscriptionSnapshot> {
  await ensureUserSubscription(pool, userId);

  const result = await pool.query<SubscriptionRow>(
    `
      SELECT
        us."planId" AS plan_id,
        us.status,
        sp."includedRecommendations" AS included_recommendations,
        us."currentPeriodStart" AS current_period_start,
        us."currentPeriodEnd" AS current_period_end,
        us."cancelAtPeriodEnd" AS cancel_at_period_end
      FROM "UserSubscription" us
      JOIN "SubscriptionPlan" sp ON sp.id = us."planId"
      WHERE us."userId" = $1
      LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Unable to resolve user subscription');
  }

  return {
    userId,
    planId: row.plan_id,
    status: row.status,
    includedRecommendations: row.included_recommendations,
    periodStart: row.current_period_start.toISOString(),
    periodEnd: row.current_period_end.toISOString(),
    cancelAtPeriodEnd: row.cancel_at_period_end,
  };
}

export async function getCreditBalanceUsd(pool: Pool, userId: string): Promise<number> {
  const result = await pool.query<CreditBalanceRow>(
    `
      SELECT COALESCE(SUM("amountUsd"), 0)::text AS balance
      FROM "CreditLedger"
      WHERE "userId" = $1
    `,
    [userId]
  );

  return toNumber(result.rows[0]?.balance, 0);
}

export async function getMonthlyRecommendationUsage(
  pool: Pool,
  userId: string,
  month: string = getMonthKey()
): Promise<number> {
  const result = await pool.query<CountRow>(
    `
      SELECT COUNT(*)::text AS count
      FROM "UsageLedger"
      WHERE "userId" = $1
        AND "usageMonth" = $2
        AND "usageType" = 'recommendation_generated'
    `,
    [userId, month]
  );

  return toNumber(result.rows[0]?.count, 0);
}

export async function getUsageSnapshot(pool: Pool, userId: string): Promise<UsageSnapshot> {
  const subscription = await getSubscriptionSnapshot(pool, userId);
  const month = getMonthKey();
  const [usedRecommendations, creditsBalanceUsd] = await Promise.all([
    getMonthlyRecommendationUsage(pool, userId, month),
    getCreditBalanceUsd(pool, userId),
  ]);

  return {
    month,
    usedRecommendations,
    includedRecommendations: subscription.includedRecommendations,
    creditsBalanceUsd,
    overagePriceUsd: OVERAGE_RECOMMENDATION_PRICE_USD,
  };
}

export async function grantSignupBonus(
  pool: Pool,
  userId: string
): Promise<{ granted: boolean; amountUsd: number; balanceUsd: number }> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM "CreditLedger" WHERE "userId" = $1 AND reason = 'signup_bonus' LIMIT 1`,
    [userId]
  );

  if (existing.rows.length > 0) {
    const balanceUsd = await getCreditBalanceUsd(pool, userId);
    return { granted: false, amountUsd: 0, balanceUsd };
  }

  await pool.query(
    `
      INSERT INTO "CreditLedger" ("userId", "amountUsd", reason, metadata, "createdAt")
      VALUES ($1, $2, 'signup_bonus', $3::jsonb, NOW())
    `,
    [userId, SIGNUP_BONUS_USD, JSON.stringify({ recommendationCredits: 2 })]
  );

  const balanceUsd = await getCreditBalanceUsd(pool, userId);
  await emitCreditsUpdatedEvent(userId, SIGNUP_BONUS_USD, 'signup_bonus', balanceUsd);
  return { granted: true, amountUsd: SIGNUP_BONUS_USD, balanceUsd };
}

export async function getAutoReloadConfig(
  pool: Pool,
  userId: string
): Promise<AutoReloadConfig> {
  const result = await pool.query<AutoReloadConfigRow>(
    `
      SELECT enabled, "thresholdUsd" AS threshold_usd, "reloadPackId" AS reload_pack_id,
             "monthlyLimitUsd" AS monthly_limit_usd
      FROM "UserAutoReloadConfig"
      WHERE "userId" = $1
      LIMIT 1
    `,
    [userId]
  );

  if (!result.rows[0]) {
    return { enabled: false, thresholdUsd: 5, reloadPackId: 'pack_10', monthlyLimitUsd: 60 };
  }

  const row = result.rows[0];
  return {
    enabled: row.enabled,
    thresholdUsd: toNumber(row.threshold_usd, 5),
    reloadPackId: (row.reload_pack_id as CreditPackId) ?? 'pack_10',
    monthlyLimitUsd: toNumber(row.monthly_limit_usd, 60),
  };
}

export async function updateAutoReloadConfig(
  pool: Pool,
  userId: string,
  patch: Partial<Omit<AutoReloadConfig, 'reloadPackId'>>
): Promise<AutoReloadConfig> {
  await pool.query(
    `
      INSERT INTO "UserAutoReloadConfig" ("userId", "enabled", "thresholdUsd", "monthlyLimitUsd", "updatedAt")
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT ("userId") DO UPDATE
        SET "enabled"         = COALESCE(EXCLUDED."enabled",         "UserAutoReloadConfig"."enabled"),
            "thresholdUsd"    = COALESCE(EXCLUDED."thresholdUsd",    "UserAutoReloadConfig"."thresholdUsd"),
            "monthlyLimitUsd" = COALESCE(EXCLUDED."monthlyLimitUsd", "UserAutoReloadConfig"."monthlyLimitUsd"),
            "updatedAt"       = NOW()
    `,
    [
      userId,
      patch.enabled ?? null,
      patch.thresholdUsd ?? null,
      patch.monthlyLimitUsd ?? null,
    ]
  );

  return getAutoReloadConfig(pool, userId);
}

export async function attemptAutoReload(
  pool: Pool,
  userId: string
): Promise<AutoReloadAttemptResult> {
  const config = await getAutoReloadConfig(pool, userId);
  if (!config.enabled) return { attempted: false, reason: 'disabled' };

  const pack = CREDIT_PACKS[config.reloadPackId];
  if (!pack) return { attempted: false, reason: 'invalid_pack' };

  // Enforce monthly spend cap
  const monthStart = startOfMonth().toISOString();
  const spentResult = await pool.query<CreditBalanceRow>(
    `
      SELECT COALESCE(SUM("amountUsd"), 0)::text AS balance
      FROM "CreditLedger"
      WHERE "userId" = $1 AND reason = 'auto_reload' AND "createdAt" >= $2
    `,
    [userId, monthStart]
  );
  const monthlySpent = toNumber(spentResult.rows[0]?.balance, 0);
  if (monthlySpent + pack.priceUsd > config.monthlyLimitUsd) {
    return { attempted: false, reason: 'monthly_limit' };
  }

  // Get Stripe customer + default payment method
  const subRow = await pool.query<{ stripe_customer_id: string | null }>(
    `SELECT "stripeCustomerId" AS stripe_customer_id FROM "UserSubscription" WHERE "userId" = $1 LIMIT 1`,
    [userId]
  );
  const stripeCustomerId = subRow.rows[0]?.stripe_customer_id;
  if (!stripeCustomerId) return { attempted: false, reason: 'no_payment_method' };

  const stripe = getStripeClient();
  if (!stripe) return { attempted: false, reason: 'stripe_unavailable' };

  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId) as import('stripe').default.Customer;
    const paymentMethodId =
      (typeof customer.invoice_settings?.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings?.default_payment_method?.id) ?? null;

    if (!paymentMethodId) return { attempted: false, reason: 'no_payment_method' };

    await stripe.paymentIntents.create({
      amount: Math.round(pack.priceUsd * 100),
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      metadata: { userId, packId: config.reloadPackId, reason: 'auto_reload' },
    });

    // Credit the user — reuse existing idempotent function with a synthetic session ID
    const syntheticSessionId = `auto_reload_${userId}_${Date.now()}`;
    await grantCreditPackPurchase(pool, userId, {
      packId: config.reloadPackId,
      checkoutSessionId: syntheticSessionId,
    });

    return { attempted: true, success: true };
  } catch (err) {
    console.warn('Auto-reload charge failed, disabling auto-reload', {
      userId,
      error: (err as Error).message,
    });
    // Disable auto-reload so we don't keep retrying a failing card
    await pool.query(
      `UPDATE "UserAutoReloadConfig" SET "enabled" = false, "updatedAt" = NOW() WHERE "userId" = $1`,
      [userId]
    );
    const balanceUsd = await getCreditBalanceUsd(pool, userId);
    await emitCreditsUpdatedEvent(userId, 0, 'auto_reload_failed', balanceUsd);
    return { attempted: true, success: false, reason: 'charge_failed' };
  }
}

export async function checkRecommendationAllowance(
  pool: Pool,
  userId: string
): Promise<RecommendationAllowance> {
  const snapshot = await getUsageSnapshot(pool, userId);

  if (snapshot.usedRecommendations < snapshot.includedRecommendations) {
    return { allowed: true, snapshot };
  }

  if (snapshot.creditsBalanceUsd >= OVERAGE_RECOMMENDATION_PRICE_USD) {
    return { allowed: true, snapshot };
  }

  // Try auto-reload before hard-blocking
  const reload = await attemptAutoReload(pool, userId);
  if (reload.attempted && reload.success) {
    const refreshedBalance = await getCreditBalanceUsd(pool, userId);
    return {
      allowed: true,
      snapshot: { ...snapshot, creditsBalanceUsd: refreshedBalance },
    };
  }

  return {
    allowed: false,
    reason:
      'Monthly recommendation credits are exhausted. Buy credits or upgrade to Grower Pro.',
    snapshot,
  };
}

export async function recordRecommendationUsageAndChargeOverage(
  pool: Pool,
  userId: string,
  recommendationId: string,
  inputId: string
): Promise<void> {
  const usageMonth = getMonthKey();

  const inserted = await pool.query<{ id: string }>(
    `
      INSERT INTO "UsageLedger" (
        "userId",
        "recommendationId",
        "inputId",
        "usageType",
        "usageMonth",
        units,
        metadata,
        "createdAt"
      )
      VALUES ($1, $2, $3, 'recommendation_generated', $4, 1, '{}'::jsonb, NOW())
      ON CONFLICT ("userId", "recommendationId", "usageType") DO NOTHING
      RETURNING id
    `,
    [userId, recommendationId, inputId, usageMonth]
  );

  if (inserted.rows.length === 0) {
    return;
  }

  const [subscription, usageCount] = await Promise.all([
    getSubscriptionSnapshot(pool, userId),
    getMonthlyRecommendationUsage(pool, userId, usageMonth),
  ]);

  if (usageCount <= subscription.includedRecommendations) {
    return;
  }

  await pool.query(
    `
      INSERT INTO "CreditLedger" (
        "userId",
        "amountUsd",
        reason,
        "recommendationId",
        metadata,
        "createdAt"
      )
      VALUES ($1, $2, 'recommendation_overage', $3, $4::jsonb, NOW())
    `,
    [
      userId,
      -OVERAGE_RECOMMENDATION_PRICE_USD,
      recommendationId,
      JSON.stringify({ usageMonth, overagePriceUsd: OVERAGE_RECOMMENDATION_PRICE_USD }),
    ]
  );

  const balanceUsd = await getCreditBalanceUsd(pool, userId);
  await emitCreditsUpdatedEvent(
    userId,
    -OVERAGE_RECOMMENDATION_PRICE_USD,
    'recommendation_overage',
    balanceUsd
  );

  // Proactively reload if balance dropped below threshold
  const config = await getAutoReloadConfig(pool, userId);
  if (config.enabled && balanceUsd < config.thresholdUsd) {
    attemptAutoReload(pool, userId).catch((err) => {
      console.warn('Proactive auto-reload failed', { userId, error: (err as Error).message });
    });
  }
}

export async function grantDetailedFeedbackReward(
  pool: Pool,
  userId: string,
  recommendationId: string
): Promise<{ granted: boolean; amountUsd: number; balanceUsd: number }> {
  const existing = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM "CreditLedger"
      WHERE "userId" = $1
        AND "recommendationId" = $2
        AND reason = 'detailed_feedback_reward'
      LIMIT 1
    `,
    [userId, recommendationId]
  );

  if (existing.rows.length > 0) {
    const balanceUsd = await getCreditBalanceUsd(pool, userId);
    return { granted: false, amountUsd: 0, balanceUsd };
  }

  const rewardSince = startOfMonth().toISOString();
  const rewardTotalResult = await pool.query<CreditBalanceRow>(
    `
      SELECT COALESCE(SUM("amountUsd"), 0)::text AS balance
      FROM "CreditLedger"
      WHERE "userId" = $1
        AND reason = 'detailed_feedback_reward'
        AND "createdAt" >= $2
    `,
    [userId, rewardSince]
  );

  const rewardTotal = toNumber(rewardTotalResult.rows[0]?.balance, 0);
  const remaining = Math.max(0, DETAILED_FEEDBACK_REWARD_CAP_USD - rewardTotal);

  if (remaining <= 0) {
    const balanceUsd = await getCreditBalanceUsd(pool, userId);
    return { granted: false, amountUsd: 0, balanceUsd };
  }

  const reward = Math.min(DETAILED_FEEDBACK_REWARD_USD, remaining);

  await pool.query(
    `
      INSERT INTO "CreditLedger" (
        "userId",
        "amountUsd",
        reason,
        "recommendationId",
        metadata,
        "createdAt"
      )
      VALUES ($1, $2, 'detailed_feedback_reward', $3, $4::jsonb, NOW())
    `,
    [
      userId,
      reward,
      recommendationId,
      JSON.stringify({ monthlyCapUsd: DETAILED_FEEDBACK_REWARD_CAP_USD }),
    ]
  );

  const balanceUsd = await getCreditBalanceUsd(pool, userId);
  await emitCreditsUpdatedEvent(userId, reward, 'detailed_feedback_reward', balanceUsd);
  return { granted: true, amountUsd: reward, balanceUsd };
}

export async function grantCreditPackPurchase(
  pool: Pool,
  userId: string,
  args: {
    packId: CreditPackId;
    checkoutSessionId: string;
    stripeEventId?: string;
    paymentIntentId?: string | null;
  }
): Promise<{ granted: boolean; amountUsd: number; balanceUsd: number }> {
  const pack = CREDIT_PACKS[args.packId];
  const existing = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM "CreditLedger"
      WHERE "userId" = $1
        AND reason = 'credit_pack_purchase'
        AND metadata->>'checkoutSessionId' = $2
      LIMIT 1
    `,
    [userId, args.checkoutSessionId]
  );

  if (existing.rows.length > 0) {
    const balanceUsd = await getCreditBalanceUsd(pool, userId);
    return { granted: false, amountUsd: 0, balanceUsd };
  }

  await pool.query(
    `
      INSERT INTO "CreditLedger" (
        "userId",
        "amountUsd",
        reason,
        metadata,
        "createdAt"
      )
      VALUES ($1, $2, 'credit_pack_purchase', $3::jsonb, NOW())
    `,
    [
      userId,
      pack.creditAmountUsd,
      JSON.stringify({
        packId: args.packId,
        recommendationCredits: pack.recommendationCredits,
        checkoutSessionId: args.checkoutSessionId,
        stripeEventId: args.stripeEventId ?? null,
        paymentIntentId: args.paymentIntentId ?? null,
      }),
    ]
  );

  const balanceUsd = await getCreditBalanceUsd(pool, userId);
  await emitCreditsUpdatedEvent(userId, pack.creditAmountUsd, 'credit_pack_purchase', balanceUsd);
  return { granted: true, amountUsd: pack.creditAmountUsd, balanceUsd };
}

export async function applyReferralRewards(
  client: Pool | PoolClient,
  referralId: string
): Promise<ReferralRewardGrant[]> {
  const referral = await client.query<{
    id: string;
    referrer_user_id: string;
    referred_user_id: string;
    status: 'pending' | 'completed' | 'voided';
  }>(
    `
      SELECT
        id,
        "referrerUserId" AS referrer_user_id,
        "referredUserId" AS referred_user_id,
        status
      FROM "Referral"
      WHERE id = $1
      LIMIT 1
    `,
    [referralId]
  );

  const row = referral.rows[0];
  if (!row || row.status !== 'completed') {
    return [];
  }

  const rewards: ReferralRewardGrant[] = [];

  for (const userId of [row.referrer_user_id, row.referred_user_id]) {
    const rewardInserted = await client.query<{ id: string }>(
      `
        INSERT INTO "ReferralReward" ("referralId", "userId", "amountUsd", "grantedAt")
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT ("referralId", "userId") DO NOTHING
        RETURNING id
      `,
      [row.id, userId, REFERRAL_REWARD_USD]
    );

    if (rewardInserted.rows.length === 0) {
      continue;
    }

    await client.query(
      `
        INSERT INTO "CreditLedger" ("userId", "amountUsd", reason, "referralId", metadata, "createdAt")
        VALUES ($1, $2, 'referral_reward', $3, $4::jsonb, NOW())
      `,
      [userId, REFERRAL_REWARD_USD, row.id, JSON.stringify({ referralId: row.id })]
    );

    const balanceResult = await client.query<CreditBalanceRow>(
      `
        SELECT COALESCE(SUM("amountUsd"), 0)::text AS balance
        FROM "CreditLedger"
        WHERE "userId" = $1
      `,
      [userId]
    );

    rewards.push({
      userId,
      amountUsd: REFERRAL_REWARD_USD,
      balanceUsd: toNumber(balanceResult.rows[0]?.balance, 0),
    });
  }

  return rewards;
}

export function resolvePlanDisplay(planId: SubscriptionTier): string {
  return SUBSCRIPTION_PLANS[planId].displayName;
}

export function tierIsPro(planId: SubscriptionTier): boolean {
  return isProTier(planId);
}
