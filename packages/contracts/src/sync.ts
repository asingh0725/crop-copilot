import { z } from 'zod';
import { PaginationSchema } from './common';
import { JobStatusSchema } from './diagnosis';

export const SyncPullRequestSchema = PaginationSchema.extend({
  includeCompletedJobs: z.coerce.boolean().default(true),
});

export const SyncInputRecordSchema = z.object({
  inputId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  type: z.enum(['PHOTO', 'LAB_REPORT']),
  crop: z.string().nullable(),
  location: z.string().nullable(),
  status: JobStatusSchema,
  recommendationId: z.string().uuid().nullable(),
});

export const SyncPullResponseSchema = z.object({
  items: z.array(SyncInputRecordSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  serverTimestamp: z.string().datetime(),
});

export type SyncPullRequest = z.infer<typeof SyncPullRequestSchema>;
export type SyncInputRecord = z.infer<typeof SyncInputRecordSchema>;
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;
