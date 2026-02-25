import {
  IngestionBatchMessageSchema,
  IngestionScheduleTriggerSchema,
  type IngestionBatchMessage,
  type IngestionScheduleTrigger,
  type IngestionSourceDescriptor,
} from '@crop-copilot/contracts';
import type { SourceRegistry } from './source-registry';

export async function buildIngestionBatchMessage(
  trigger: IngestionScheduleTrigger,
  registry: SourceRegistry,
  now: Date
): Promise<IngestionBatchMessage | null> {
  const parsedTrigger = IngestionScheduleTriggerSchema.parse(trigger);
  const dueSources = (await registry.listDueSources(now)).slice(0, parsedTrigger.maxSources);
  if (dueSources.length === 0) {
    return null;
  }

  return IngestionBatchMessageSchema.parse({
    messageType: 'ingestion.batch.requested',
    messageVersion: '1',
    requestedAt: now.toISOString(),
    sources: prioritizeSources(dueSources),
  });
}

function prioritizeSources(sources: IngestionSourceDescriptor[]): IngestionSourceDescriptor[] {
  const order = {
    high: 0,
    medium: 1,
    low: 2,
  } as const;

  return [...sources].sort((a, b) => {
    const priorityDelta = order[a.priority] - order[b.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return a.sourceId.localeCompare(b.sourceId);
  });
}
