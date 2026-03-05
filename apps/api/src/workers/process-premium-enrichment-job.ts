import type { SQSBatchItemFailure, SQSEvent, SQSHandler } from 'aws-lambda';
import { PremiumEnrichmentRequestedSchema, type PremiumEnrichmentRequested } from '@crop-copilot/contracts';
import { Pool } from 'pg';
import {
  getPushEventPublisher,
  type PushEventPublisher,
} from '../notifications/push-events';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { runPremiumEnrichment } from '../premium/enrichment-service';
import { upsertPremiumInsight } from '../premium/premium-store';
import { DEFAULT_ADVISORY_NOTICE } from '../premium/types';

let premiumPool: Pool | null = null;

function getPremiumPool(): Pool {
  if (!premiumPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for premium enrichment worker');
    }

    premiumPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 6),
      ssl: resolvePoolSslConfig(),
    });
  }

  return premiumPool;
}

function isPremiumEnrichmentEnabled(): boolean {
  return (process.env.ENABLE_PREMIUM_ENRICHMENT ?? 'true').toLowerCase() === 'true';
}

async function processMessage(
  payload: PremiumEnrichmentRequested,
  pushEvents: PushEventPublisher
): Promise<void> {
  const pool = getPremiumPool();

  if (!isPremiumEnrichmentEnabled()) {
    await upsertPremiumInsight(pool, payload.userId, payload.recommendationId, {
      status: 'not_available',
      riskReview: null,
      complianceDecision: null,
      checks: [],
      costAnalysis: null,
      sprayWindows: [],
      advisoryNotice: DEFAULT_ADVISORY_NOTICE,
      report: null,
      failureReason: 'Premium enrichment is disabled by configuration',
    });
    return;
  }

  const result = await runPremiumEnrichment({
    pool,
    userId: payload.userId,
    recommendationId: payload.recommendationId,
  });

  if (result.status === 'ready' || result.status === 'failed') {
    await pushEvents.publishRecommendationPremiumReady({
      eventType: 'recommendation.premium_ready',
      eventVersion: '1',
      occurredAt: new Date().toISOString(),
      traceId: payload.traceId,
      userId: payload.userId,
      recommendationId: payload.recommendationId,
      status: result.status,
      riskReview: result.riskReview,
    });
  }
}

export function buildProcessPremiumEnrichmentJobHandler(
  pushEvents: PushEventPublisher = getPushEventPublisher()
): SQSHandler {
  return async (event: SQSEvent) => {
    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of event.Records) {
      try {
        const payload = PremiumEnrichmentRequestedSchema.parse(JSON.parse(record.body));
        await processMessage(payload, pushEvents);
      } catch (error) {
        console.error('Failed to process premium enrichment record', {
          messageId: record.messageId,
          error: (error as Error).message,
        });
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return {
      batchItemFailures,
    };
  };
}

export const handler = buildProcessPremiumEnrichmentJobHandler();
