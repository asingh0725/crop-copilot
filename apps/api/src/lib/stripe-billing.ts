import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import Stripe from 'stripe';
import {
  CREDIT_PACKS,
  SUBSCRIPTION_PLANS,
  type CreditPackId,
  type SubscriptionTier,
} from './subscription-plans';

let stripeClient: Stripe | null | undefined;

export type NormalizedSubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled';

function normalizeAbsoluteUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/\/+$/, '');
}

function resolveForwardedAppUrl(headers: Record<string, string | undefined>): string | null {
  const explicitOrigin = headers.origin?.trim();
  if (explicitOrigin && /^https?:\/\//i.test(explicitOrigin)) {
    return normalizeAbsoluteUrl(explicitOrigin);
  }

  const proto = headers['x-forwarded-proto']?.trim();
  const host = headers['x-forwarded-host']?.trim() ?? headers.host?.trim();
  if (!proto || !host) {
    return null;
  }

  return normalizeAbsoluteUrl(`${proto}://${host}`);
}

export function toAbsoluteUrl(base: string, maybeRelative: string): string {
  if (/^https?:\/\//i.test(maybeRelative)) {
    return maybeRelative;
  }
  const relative = maybeRelative.startsWith('/') ? maybeRelative : `/${maybeRelative}`;
  return `${normalizeAbsoluteUrl(base)}${relative}`;
}

export function resolveAppBaseUrl(event?: APIGatewayProxyEventV2): string {
  const configured =
    process.env.APP_BASE_URL?.trim() ??
    process.env.WEB_APP_URL?.trim() ??
    process.env.NEXT_PUBLIC_APP_URL?.trim() ??
    '';

  if (configured) {
    return normalizeAbsoluteUrl(configured);
  }

  const headers = Object.fromEntries(
    Object.entries(event?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value ?? undefined])
  );
  const forwarded = resolveForwardedAppUrl(headers);
  if (forwarded) {
    return forwarded;
  }

  return 'http://localhost:3000';
}

export function resolveCheckoutUrls(
  event: APIGatewayProxyEventV2,
  successUrl?: string,
  cancelUrl?: string
): { successUrl: string; cancelUrl: string } {
  const base = resolveAppBaseUrl(event);

  return {
    successUrl: toAbsoluteUrl(base, successUrl ?? '/settings/billing?checkout=success'),
    cancelUrl: toAbsoluteUrl(base, cancelUrl ?? '/settings/billing?checkout=cancelled'),
  };
}

export function resolvePortalReturnUrl(
  event: APIGatewayProxyEventV2,
  returnUrl?: string
): string {
  const base = resolveAppBaseUrl(event);
  return toAbsoluteUrl(base, returnUrl ?? '/settings/billing');
}

export function getStripeClient(): Stripe | null {
  if (stripeClient !== undefined) {
    return stripeClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    stripeClient = null;
    return stripeClient;
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
  });

  return stripeClient;
}

export function stripePriceIdForTier(tier: SubscriptionTier): string | null {
  switch (tier) {
    case 'grower_free':
      return process.env.STRIPE_PRICE_GROWER_FREE?.trim() || null;
    case 'grower':
      return process.env.STRIPE_PRICE_GROWER?.trim() || null;
    case 'grower_pro':
      return process.env.STRIPE_PRICE_GROWER_PRO?.trim() || null;
    default:
      return null;
  }
}

export function stripePriceIdForCreditPack(packId: CreditPackId): string | null {
  switch (packId) {
    case 'pack_10':
      return process.env.STRIPE_PRICE_CREDIT_PACK_10?.trim() || null;
    default:
      return null;
  }
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return fallback;
}

function autoProvisionCatalogEnabled(): boolean {
  return parseBoolean(process.env.STRIPE_AUTO_PROVISION_CATALOG, true);
}

function tierLookupKey(tier: SubscriptionTier): string {
  return `crop_copilot_${tier}_monthly_v1`;
}

function creditPackLookupKey(packId: CreditPackId): string {
  return `crop_copilot_${packId}_onetime_v1`;
}

async function findPriceByLookupKey(stripe: Stripe, lookupKey: string): Promise<string | null> {
  const existing = await stripe.prices.list({
    active: true,
    lookup_keys: [lookupKey],
    limit: 1,
  });

  return existing.data[0]?.id ?? null;
}

async function createTierPrice(
  stripe: Stripe,
  tier: SubscriptionTier,
  lookupKey: string
): Promise<string> {
  const plan = SUBSCRIPTION_PLANS[tier];
  const unitAmount = Math.max(0, Math.round(plan.priceUsd * 100));
  const price = await stripe.prices.create({
    currency: 'usd',
    unit_amount: unitAmount,
    recurring: {
      interval: 'month',
    },
    lookup_key: lookupKey,
    product_data: {
      name: `Crop Copilot ${plan.displayName}`,
      metadata: {
        app: 'crop-copilot',
        sku: tier,
        billingPeriod: 'monthly',
      },
    },
    metadata: {
      app: 'crop-copilot',
      planId: tier,
    },
  });

  return price.id;
}

async function createCreditPackPrice(
  stripe: Stripe,
  packId: CreditPackId,
  lookupKey: string
): Promise<string> {
  const pack = CREDIT_PACKS[packId];
  const unitAmount = Math.max(0, Math.round(pack.priceUsd * 100));
  const price = await stripe.prices.create({
    currency: 'usd',
    unit_amount: unitAmount,
    lookup_key: lookupKey,
    product_data: {
      name: `Crop Copilot ${pack.displayName} Credit Pack`,
      metadata: {
        app: 'crop-copilot',
        sku: packId,
      },
    },
    metadata: {
      app: 'crop-copilot',
      creditPackId: packId,
      recommendationCredits: String(pack.recommendationCredits),
    },
  });

  return price.id;
}

export async function resolveStripePriceIdForTier(
  stripe: Stripe,
  tier: SubscriptionTier
): Promise<string | null> {
  const configured = stripePriceIdForTier(tier);
  if (configured) {
    return configured;
  }

  if (!autoProvisionCatalogEnabled()) {
    return null;
  }

  const lookupKey = tierLookupKey(tier);
  const existing = await findPriceByLookupKey(stripe, lookupKey);
  if (existing) {
    return existing;
  }

  try {
    return await createTierPrice(stripe, tier, lookupKey);
  } catch (error) {
    // Handle races by re-checking lookup key before surfacing the error.
    const raced = await findPriceByLookupKey(stripe, lookupKey).catch(() => null);
    if (raced) {
      return raced;
    }
    throw error;
  }
}

export async function resolveStripePriceIdForCreditPack(
  stripe: Stripe,
  packId: CreditPackId
): Promise<string | null> {
  const configured = stripePriceIdForCreditPack(packId);
  if (configured) {
    return configured;
  }

  if (!autoProvisionCatalogEnabled()) {
    return null;
  }

  const lookupKey = creditPackLookupKey(packId);
  const existing = await findPriceByLookupKey(stripe, lookupKey);
  if (existing) {
    return existing;
  }

  try {
    return await createCreditPackPrice(stripe, packId, lookupKey);
  } catch (error) {
    const raced = await findPriceByLookupKey(stripe, lookupKey).catch(() => null);
    if (raced) {
      return raced;
    }
    throw error;
  }
}

export function tierFromStripePriceId(priceId?: string | null): SubscriptionTier | null {
  if (!priceId) {
    return null;
  }

  const mapping: Array<[SubscriptionTier, string | undefined]> = [
    ['grower_free', process.env.STRIPE_PRICE_GROWER_FREE],
    ['grower', process.env.STRIPE_PRICE_GROWER],
    ['grower_pro', process.env.STRIPE_PRICE_GROWER_PRO],
  ];

  for (const [tier, envPriceId] of mapping) {
    if (envPriceId && envPriceId.trim() === priceId) {
      return tier;
    }
  }

  return null;
}

export function creditPackFromStripePriceId(priceId?: string | null): CreditPackId | null {
  if (!priceId) {
    return null;
  }

  const mapping: Array<[CreditPackId, string | undefined]> = [
    ['pack_10', process.env.STRIPE_PRICE_CREDIT_PACK_10],
  ];

  for (const [packId, envPriceId] of mapping) {
    if (envPriceId && envPriceId.trim() === priceId) {
      return packId;
    }
  }

  return null;
}

export function normalizeStripeSubscriptionStatus(
  status: Stripe.Subscription.Status
): NormalizedSubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'canceled':
      return 'canceled';
    default:
      return 'past_due';
  }
}

export function preferredUserIdFromCheckoutSession(
  session: Stripe.Checkout.Session
): string | null {
  const fromClientReference = session.client_reference_id?.trim();
  if (fromClientReference) {
    return fromClientReference;
  }

  const fromMetadata = session.metadata?.userId?.trim();
  if (fromMetadata) {
    return fromMetadata;
  }

  return null;
}
