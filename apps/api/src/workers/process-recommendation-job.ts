import type { SQSBatchItemFailure, SQSEvent, SQSHandler } from 'aws-lambda';
import { RecommendationJobRequestedSchema } from '@crop-copilot/contracts';
import { getRecommendationStore, type RecommendationStore } from '../lib/store';
import {
  getPushEventPublisher,
  type PushEventPublisher,
} from '../notifications/push-events';
import { runRecommendationPipeline } from '../pipeline/recommendation-pipeline';

type RecommendationPipelineRunner = typeof runRecommendationPipeline;

async function processMessage(
  messageBody: string,
  store: RecommendationStore,
  pipelineRunner: RecommendationPipelineRunner,
  pushEvents: PushEventPublisher
): Promise<void> {
  const payload = RecommendationJobRequestedSchema.parse(JSON.parse(messageBody));
  const currentStatus = await store.getJobStatus(payload.jobId, payload.userId);

  if (!currentStatus) {
    throw new Error(`Recommendation job not found: ${payload.jobId}`);
  }

  // Standard SQS can redeliver messages; avoid re-running already-finished jobs.
  if (currentStatus.status === 'completed') {
    return;
  }

  // If another worker has already started this job, skip duplicate delivery.
  if (currentStatus.status !== 'queued' && currentStatus.status !== 'failed') {
    return;
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
      userId: payload.userId,
      inputId: payload.inputId,
      jobId: payload.jobId,
      recommendationId: result.recommendationId,
    });
  } catch (error) {
    console.error('Failed to publish recommendation.ready event', {
      jobId: payload.jobId,
      userId: payload.userId,
      error: (error as Error).message,
    });
  }
}

export function buildProcessRecommendationJobHandler(
  store: RecommendationStore = getRecommendationStore(),
  pipelineRunner: RecommendationPipelineRunner = runRecommendationPipeline,
  pushEvents: PushEventPublisher = getPushEventPublisher()
): SQSHandler {
  return async (event: SQSEvent) => {
    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of event.Records) {
      try {
        await processMessage(record.body, store, pipelineRunner, pushEvents);
      } catch (error) {
        console.error('Failed to process recommendation job record', {
          messageId: record.messageId,
          error: (error as Error).message,
        });

        try {
          const payload = RecommendationJobRequestedSchema.parse(JSON.parse(record.body));
          await store.updateJobStatus(
            payload.jobId,
            payload.userId,
            'failed',
            (error as Error).message
          );
        } catch {
          // ignore parsing/update errors here and still return batch item failure
        }

        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return {
      batchItemFailures,
    };
  };
}

export const handler = buildProcessRecommendationJobHandler();
