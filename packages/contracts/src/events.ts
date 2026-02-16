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

export const RecommendationJobRequestedSchema = z.object({
  messageType: z.literal('recommendation.job.requested'),
  messageVersion: z.literal('1'),
  requestedAt: z.string().datetime(),
  traceId: z.string().min(8).max(128).optional(),
  userId: z.string().uuid(),
  inputId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export type RecommendationJobStatusChangedEvent = z.infer<
  typeof RecommendationJobStatusChangedEventSchema
>;
export type RecommendationReadyEvent = z.infer<typeof RecommendationReadyEventSchema>;
export type RecommendationJobRequested = z.infer<
  typeof RecommendationJobRequestedSchema
>;
