import { z } from 'zod';

export const CreateUploadUrlRequestSchema = z.object({
  fileName: z.string().min(1).max(256),
  contentType: z.string().min(3).max(128),
  contentLength: z.number().int().positive().max(25 * 1024 * 1024),
});

export const CreateUploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  objectKey: z.string(),
  expiresInSeconds: z.number().int().positive(),
});

export type CreateUploadUrlRequest = z.infer<typeof CreateUploadUrlRequestSchema>;
export type CreateUploadUrlResponse = z.infer<typeof CreateUploadUrlResponseSchema>;
