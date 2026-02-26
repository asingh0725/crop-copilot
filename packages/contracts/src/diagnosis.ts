import { z } from 'zod';
import { IdempotencyKeySchema } from './common';

export const InputTypeSchema = z.enum(['PHOTO', 'LAB_REPORT']);

export const JobStatusSchema = z.enum([
  'queued',
  'retrieving_context',
  'generating_recommendation',
  'validating_output',
  'persisting_result',
  'completed',
  'failed',
]);

export const CreateInputCommandSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  type: InputTypeSchema,
  imageUrl: z.string().url().optional(),
  description: z.string().min(1).max(5000).optional(),
  labData: z.record(z.string(), z.unknown()).optional(),
  location: z.string().max(120).optional(),
  crop: z.string().max(80).optional(),
  season: z.string().max(80).optional(),
  fieldAcreage: z.number().positive().max(100_000).nullable().optional(),
  plannedApplicationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'plannedApplicationDate must be YYYY-MM-DD')
    .nullable()
    .optional(),
  fieldLatitude: z.number().min(-90).max(90).nullable().optional(),
  fieldLongitude: z.number().min(-180).max(180).nullable().optional(),
});

export const CreateInputAcceptedSchema = z.object({
  inputId: z.string().uuid(),
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  acceptedAt: z.string().datetime(),
});

export const RecommendationSourceSchema = z.object({
  chunkId: z.string(),
  relevance: z.number().min(0).max(1),
  excerpt: z.string().max(300),
});

export const RecommendationResultSchema = z.object({
  recommendationId: z.string().uuid(),
  confidence: z.number().min(0).max(1),
  diagnosis: z.record(z.string(), z.unknown()),
  sources: z.array(RecommendationSourceSchema).default([]),
  modelUsed: z.string(),
});

export const RecommendationJobStatusResponseSchema = z.object({
  inputId: z.string().uuid(),
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  updatedAt: z.string().datetime(),
  failureReason: z.string().optional(),
  result: RecommendationResultSchema.optional(),
});

export type InputType = z.infer<typeof InputTypeSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type CreateInputCommand = z.infer<typeof CreateInputCommandSchema>;
export type CreateInputAccepted = z.infer<typeof CreateInputAcceptedSchema>;
export type RecommendationResult = z.infer<typeof RecommendationResultSchema>;
export type RecommendationJobStatusResponse = z.infer<
  typeof RecommendationJobStatusResponseSchema
>;
