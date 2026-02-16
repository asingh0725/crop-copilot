import type { SQSBatchItemFailure, SQSEvent, SQSHandler } from 'aws-lambda';
import { RecommendationJobRequestedSchema } from '@crop-copilot/contracts';
import { getRecommendationStore } from '../lib/store';
import { runRecommendationPipeline } from '../pipeline/recommendation-pipeline';

async function processMessage(messageBody: string): Promise<void> {
  const payload = RecommendationJobRequestedSchema.parse(JSON.parse(messageBody));
  const store = getRecommendationStore();
  const currentStatus = await store.getJobStatus(payload.jobId, payload.userId);

  if (!currentStatus) {
    throw new Error('Recommendation job not found');
  }

  // Standard SQS can redeliver messages; avoid re-running already-finished jobs.
  if (currentStatus.status === 'completed') {
    return;
  }

  // If another worker has already started this job, skip this duplicate delivery.
  if (
    currentStatus.status !== 'queued' &&
    currentStatus.status !== 'failed'
  ) {
    return;
  }

  await store.updateJobStatus(payload.jobId, payload.userId, 'retrieving_context');
  await store.updateJobStatus(payload.jobId, payload.userId, 'generating_recommendation');
  await store.updateJobStatus(payload.jobId, payload.userId, 'validating_output');

  const result = await runRecommendationPipeline({
    inputId: payload.inputId,
    userId: payload.userId,
    jobId: payload.jobId,
  });

  await store.saveRecommendationResult(payload.jobId, payload.userId, result);
  await store.updateJobStatus(payload.jobId, payload.userId, 'persisting_result');
  await store.updateJobStatus(payload.jobId, payload.userId, 'completed');
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      await processMessage(record.body);
    } catch (error) {
      console.error('Failed to process recommendation job record', {
        messageId: record.messageId,
        error: (error as Error).message,
      });

      try {
        const payload = RecommendationJobRequestedSchema.parse(JSON.parse(record.body));
        await getRecommendationStore().updateJobStatus(
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
