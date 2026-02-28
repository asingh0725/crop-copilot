import { z } from 'zod';

export const IngestionSourcePrioritySchema = z.enum(['high', 'medium', 'low']);

export const IngestionSourceDescriptorSchema = z.object({
  sourceId: z.string().min(1),
  url: z.string().url(),
  priority: IngestionSourcePrioritySchema,
  freshnessHours: z.number().int().positive(),
  tags: z.array(z.string()).default([]),
});

export const IngestionScheduleTriggerSchema = z.object({
  trigger: z.enum(['scheduled', 'manual']),
  scheduledAt: z.string().datetime(),
  maxSources: z.number().int().positive().max(500).default(50),
});

export const IngestionBatchMessageSchema = z.object({
  messageType: z.literal('ingestion.batch.requested'),
  messageVersion: z.literal('1'),
  requestedAt: z.string().datetime(),
  sources: z.array(IngestionSourceDescriptorSchema).min(1),
});

export const ComplianceSourceDescriptorSchema = z.object({
  sourceId: z.string().uuid(),
  url: z.string().url(),
  priority: IngestionSourcePrioritySchema,
  freshnessHours: z.number().int().positive(),
  jurisdiction: z.string().min(1).max(80).default('US'),
  state: z.string().max(80).nullable().optional(),
  crop: z.string().max(80).nullable().optional(),
  tags: z.array(z.string()).default([]),
});

export const ComplianceIngestionBatchMessageSchema = z.object({
  messageType: z.literal('compliance.ingestion.batch.requested'),
  messageVersion: z.literal('1'),
  requestedAt: z.string().datetime(),
  runId: z.string().uuid().optional(),
  sources: z.array(ComplianceSourceDescriptorSchema).min(1),
});

export type IngestionSourcePriority = z.infer<typeof IngestionSourcePrioritySchema>;
export type IngestionSourceDescriptor = z.infer<typeof IngestionSourceDescriptorSchema>;
export type IngestionScheduleTrigger = z.infer<typeof IngestionScheduleTriggerSchema>;
export type IngestionBatchMessage = z.infer<typeof IngestionBatchMessageSchema>;
export type ComplianceSourceDescriptor = z.infer<typeof ComplianceSourceDescriptorSchema>;
export type ComplianceIngestionBatchMessage = z.infer<
  typeof ComplianceIngestionBatchMessageSchema
>;
