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
import { recordPipelineEvent } from '../lib/pipeline-events';

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
      if (dbPool) {
        await recordPipelineEvent(dbPool, {
          pipeline: 'discovery',
          stage: 'orchestrator',
          severity: 'info',
          message: 'No due discovery sources for ingestion.',
          metadata: {
            trigger: trigger.trigger,
            maxSources: trigger.maxSources,
          },
        });
      }
      return;
    }

    console.log(`[RunIngestionBatch] Queueing ${batch.sources.length} sources for ingestion`);
    await queue.publishIngestionBatch(batch);
    if (dbPool) {
      await recordPipelineEvent(dbPool, {
        pipeline: 'discovery',
        stage: 'orchestrator',
        severity: 'info',
        message: `Queued ${batch.sources.length} discovery sources for ingestion.`,
        metadata: {
          trigger: trigger.trigger,
          maxSources: trigger.maxSources,
          queued: batch.sources.length,
        },
      });
    }
  };
}

export const handler = buildRunIngestionBatchHandler();
