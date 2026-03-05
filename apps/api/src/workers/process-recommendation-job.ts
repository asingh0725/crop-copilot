import type { SQSBatchItemFailure, SQSEvent, SQSHandler } from 'aws-lambda';
import {
  RecommendationJobRequestedSchema,
  type RecommendationJobRequested,
} from '@crop-copilot/contracts';
import { getRecommendationStore, type RecommendationStore } from '../lib/store';
import {
  getPushEventPublisher,
  type PushEventPublisher,
} from '../notifications/push-events';
import {
  getPremiumEnrichmentQueue,
  type PremiumEnrichmentQueue,
} from '../queue/premium-enrichment-queue';
import { runRecommendationPipeline } from '../pipeline/recommendation-pipeline';
import {
  emitRecommendationMetrics,
  type RecommendationMetricPayload,
} from '../telemetry/recommendation-metrics';

type RecommendationPipelineRunner = typeof runRecommendationPipeline;
type RecommendationMetricsReporter = (payload: RecommendationMetricPayload) => void;

interface ProcessedRecommendationResult {
  traceId?: string;
  modelUsed?: string;
  estimatedCostUsd: number;
}

async function processMessage(
  payload: RecommendationJobRequested,
  store: RecommendationStore,
  pipelineRunner: RecommendationPipelineRunner,
  pushEvents: PushEventPublisher,
  premiumQueue: PremiumEnrichmentQueue
): Promise<ProcessedRecommendationResult | null> {
  const currentStatus = await store.getJobStatus(payload.jobId, payload.userId);

  if (!currentStatus) {
    throw new Error(`Recommendation job not found: ${payload.jobId}`);
  }

  // Standard SQS can redeliver messages; avoid re-running already-finished jobs.
  if (currentStatus.status === 'completed') {
    return null;
  }

  // If another worker has already started this job, skip duplicate delivery.
  if (currentStatus.status !== 'queued' && currentStatus.status !== 'failed') {
    return null;
  }

  await store.updateJobStatus(payload.jobId, payload.userId, 'retrieving_context');
  await store.updateJobStatus(payload.jobId, payload.userId, 'generating_recommendation');
  await store.updateJobStatus(payload.jobId, payload.userId, 'validating_output');

  const result = await pipelineRunner({
    inputId: payload.inputId,
    userId: payload.userId,
    jobId: payload.jobId,
  });

  await store.saveRecommendationResult(payload.jobId, payload.userId, result);
  await store.updateJobStatus(payload.jobId, payload.userId, 'persisting_result');
  await store.updateJobStatus(payload.jobId, payload.userId, 'completed');

  try {
    await pushEvents.publishRecommendationReady({
      eventType: 'recommendation.ready',
      eventVersion: '1',
      occurredAt: new Date().toISOString(),
      traceId: payload.traceId,
      userId: payload.userId,
      inputId: payload.inputId,
      jobId: payload.jobId,
      recommendationId: result.recommendationId,
    });
  } catch (error) {
    console.error('Failed to publish recommendation.ready event', {
      jobId: payload.jobId,
      userId: payload.userId,
      traceId: payload.traceId,
      error: (error as Error).message,
    });
  }

  try {
    await premiumQueue.publishPremiumEnrichment({
      messageType: 'premium.enrichment.requested',
      messageVersion: '1',
      requestedAt: new Date().toISOString(),
      traceId: payload.traceId,
      userId: payload.userId,
      recommendationId: result.recommendationId,
    });
  } catch (error) {
    console.error('Failed to enqueue premium enrichment job', {
      recommendationId: result.recommendationId,
      userId: payload.userId,
      traceId: payload.traceId,
      error: (error as Error).message,
    });
  }

  return {
    traceId: payload.traceId,
    modelUsed: result.modelUsed,
    estimatedCostUsd: estimateRecommendationCostUsd(result.modelUsed),
  };
}

export function buildProcessRecommendationJobHandler(
  store: RecommendationStore = getRecommendationStore(),
  pipelineRunner: RecommendationPipelineRunner = runRecommendationPipeline,
  pushEvents: PushEventPublisher = getPushEventPublisher(),
  premiumQueue: PremiumEnrichmentQueue = getPremiumEnrichmentQueue(),
  metricsReporter: RecommendationMetricsReporter = emitRecommendationMetrics
): SQSHandler {
  return async (event: SQSEvent) => {
    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of event.Records) {
      const startedAt = Date.now();
      let payload: RecommendationJobRequested | null = null;

      try {
        payload = RecommendationJobRequestedSchema.parse(JSON.parse(record.body));
        const result = await processMessage(
          payload,
          store,
          pipelineRunner,
          pushEvents,
          premiumQueue
        );

        if (result) {
          metricsReporter({
            status: 'completed',
            durationMs: Date.now() - startedAt,
            estimatedCostUsd: result.estimatedCostUsd,
            traceId: result.traceId,
            modelUsed: result.modelUsed,
          });
        }
      } catch (error) {
        console.error('Failed to process recommendation job record', {
          messageId: record.messageId,
          traceId: payload?.traceId,
          error: (error as Error).message,
        });

        try {
          if (!payload) {
            payload = RecommendationJobRequestedSchema.parse(JSON.parse(record.body));
          }

          await store.updateJobStatus(payload.jobId, payload.userId, 'failed', (error as Error).message);
        } catch {
          // ignore parsing/update errors here and still return batch item failure
        }

        metricsReporter({
          status: 'failed',
          durationMs: Date.now() - startedAt,
          estimatedCostUsd: 0,
          traceId: payload?.traceId,
        });

        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return {
      batchItemFailures,
    };
  };
}

export const handler = buildProcessRecommendationJobHandler();

function estimateRecommendationCostUsd(modelUsed: string): number {
  const fallback = parseCostValue(process.env.RECOMMENDATION_COST_USD, 0.81);
  const byModelRaw = process.env.RECOMMENDATION_COST_BY_MODEL_JSON;

  if (!byModelRaw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(byModelRaw) as Record<string, unknown>;
    const modelValue = parsed[modelUsed];
    return parseCostValue(modelValue, fallback);
  } catch {
    return fallback;
  }
}

function parseCostValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}
