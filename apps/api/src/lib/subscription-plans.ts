export type SubscriptionTier = 'grower_free' | 'grower' | 'grower_pro';
export type CreditPackId = 'pack_10';

export interface SubscriptionPlanConfig {
  id: SubscriptionTier;
  displayName: string;
  priceUsd: number;
  includedRecommendations: number;
}

export interface CreditPackConfig {
  id: CreditPackId;
  displayName: string;
  priceUsd: number;
  recommendationCredits: number;
  creditAmountUsd: number;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlanConfig> = {
  grower_free: {
    id: 'grower_free',
    displayName: 'Grower Free',
    priceUsd: 0,
    includedRecommendations: 3,
  },
  grower: {
    id: 'grower',
    displayName: 'Grower',
    priceUsd: 29,
    includedRecommendations: 30,
  },
  grower_pro: {
    id: 'grower_pro',
    displayName: 'Grower Pro',
    priceUsd: 45,
    includedRecommendations: 40,
  },
};

export const CREDIT_PACKS: Record<CreditPackId, CreditPackConfig> = {
  pack_10: {
    id: 'pack_10',
    displayName: '10 recommendations',
    priceUsd: 12,
    recommendationCredits: 10,
    creditAmountUsd: 12,
  },
};

export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTier = 'grower_free';
export const OVERAGE_RECOMMENDATION_PRICE_USD = 1.2;
export const DETAILED_FEEDBACK_REWARD_USD = 0.05;
export const DETAILED_FEEDBACK_REWARD_CAP_USD = 2.5;
export const REFERRAL_REWARD_USD = 10;

export function isProTier(tier: SubscriptionTier): boolean {
  return tier === 'grower_pro';
}
