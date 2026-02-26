import { z } from 'zod';
import { JobStatusSchema } from './diagnosis';

export const RecommendationJobStatusChangedEventSchema = z.object({
  eventType: z.literal('recommendation.job.status_changed'),
  eventVersion: z.literal('1'),
  occurredAt: z.string().datetime(),
  userId: z.string().uuid(),
  inputId: z.string().uuid(),
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const RecommendationReadyEventSchema = z.object({
  eventType: z.literal('recommendation.ready'),
  eventVersion: z.literal('1'),
  occurredAt: z.string().datetime(),
  traceId: z.string().min(8).max(128).optional(),
  userId: z.string().uuid(),
  inputId: z.string().uuid(),
  jobId: z.string().uuid(),
  recommendationId: z.string().uuid(),
});

export const RecommendationPremiumReadyEventSchema = z.object({
  eventType: z.literal('recommendation.premium_ready'),
  eventVersion: z.literal('1'),
  occurredAt: z.string().datetime(),
  traceId: z.string().min(8).max(128).optional(),
  userId: z.string().uuid(),
  recommendationId: z.string().uuid(),
  status: z.enum(['ready', 'failed']),
  riskReview: z
    .enum(['clear_signal', 'potential_conflict', 'needs_manual_verification'])
    .nullable()
    .optional(),
});

export const SubscriptionUpdatedEventSchema = z.object({
  eventType: z.literal('subscription.updated'),
  eventVersion: z.literal('1'),
  occurredAt: z.string().datetime(),
  userId: z.string().uuid(),
  status: z.enum(['active', 'past_due', 'canceled', 'trialing']),
  tier: z.enum(['grower_free', 'grower', 'grower_pro']),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

export const CreditsUpdatedEventSchema = z.object({
  eventType: z.literal('credits.updated'),
  eventVersion: z.literal('1'),
  occurredAt: z.string().datetime(),
  userId: z.string().uuid(),
  deltaUsd: z.number(),
  reason: z.string().min(1).max(120),
  balanceUsd: z.number(),
});

export const RecommendationJobRequestedSchema = z.object({
  messageType: z.literal('recommendation.job.requested'),
  messageVersion: z.literal('1'),
  requestedAt: z.string().datetime(),
  traceId: z.string().min(8).max(128).optional(),
  userId: z.string().uuid(),
  inputId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const PremiumEnrichmentRequestedSchema = z.object({
  messageType: z.literal('premium.enrichment.requested'),
  messageVersion: z.literal('1'),
  requestedAt: z.string().datetime(),
  traceId: z.string().min(8).max(128).optional(),
  userId: z.string().uuid(),
  recommendationId: z.string().uuid(),
});

export type RecommendationJobStatusChangedEvent = z.infer<
  typeof RecommendationJobStatusChangedEventSchema
>;
export type RecommendationReadyEvent = z.infer<typeof RecommendationReadyEventSchema>;
export type RecommendationPremiumReadyEvent = z.infer<
  typeof RecommendationPremiumReadyEventSchema
>;
export type SubscriptionUpdatedEvent = z.infer<typeof SubscriptionUpdatedEventSchema>;
export type CreditsUpdatedEvent = z.infer<typeof CreditsUpdatedEventSchema>;
export type RecommendationJobRequested = z.infer<
  typeof RecommendationJobRequestedSchema
>;
export type PremiumEnrichmentRequested = z.infer<typeof PremiumEnrichmentRequestedSchema>;
