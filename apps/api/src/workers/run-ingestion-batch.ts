import type { EventBridgeHandler } from 'aws-lambda';
import { Pool } from 'pg';
import {
  IngestionScheduleTriggerSchema,
  type IngestionScheduleTrigger,
} from '@crop-copilot/contracts';
import { buildIngestionBatchMessage } from '../ingestion/orchestrator';
import {
  getSourceRegistry,
  type SourceRegistry,
} from '../ingestion/source-registry';
import { DbSourceRegistry } from '../ingestion/db-source-registry';
import {
  getIngestionQueue,
  type IngestionQueue,
} from '../queue/ingestion-queue';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

interface ScheduledIngestionEvent {
  trigger?: 'scheduled' | 'manual';
  maxSources?: number;
}

let dbPool: Pool | null = null;

function resolveRegistry(): SourceRegistry {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    if (!dbPool) {
      dbPool = new Pool({
        connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
        max: Number(process.env.PG_POOL_MAX ?? 3),
        ssl: resolvePoolSslConfig(),
      });
    }
    return new DbSourceRegistry(dbPool);
  }
  return getSourceRegistry();
}

export function buildRunIngestionBatchHandler(
  queue: IngestionQueue = getIngestionQueue(),
  registry: SourceRegistry = resolveRegistry()
): EventBridgeHandler<'crop-copilot.ingestion.scheduled', ScheduledIngestionEvent, void> {
  return async (event) => {
    const now = new Date();

    const trigger: IngestionScheduleTrigger = IngestionScheduleTriggerSchema.parse({
      trigger: event.detail?.trigger ?? 'scheduled',
      maxSources: event.detail?.maxSources ?? 50,
      scheduledAt: now.toISOString(),
    });

    const batch = await buildIngestionBatchMessage(trigger, registry, now);
    if (!batch) {
      console.log('[RunIngestionBatch] No sources due for ingestion');
      return;
    }

    console.log(`[RunIngestionBatch] Queueing ${batch.sources.length} sources for ingestion`);
    await queue.publishIngestionBatch(batch);
  };
}

export const handler = buildRunIngestionBatchHandler();
