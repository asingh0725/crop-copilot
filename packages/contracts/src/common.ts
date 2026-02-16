import { z } from 'zod';

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const ApiErrorResponseSchema = z.object({
  error: ApiErrorSchema,
});

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

export const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[a-zA-Z0-9._:-]+$/, 'Invalid idempotency key format');

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
