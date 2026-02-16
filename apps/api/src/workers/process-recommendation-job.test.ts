import test from 'node:test';
import assert from 'node:assert/strict';
import type { SQSEvent } from 'aws-lambda';
import { handler } from './process-recommendation-job';
import { InMemoryRecommendationStore, setRecommendationStore } from '../lib/store';

test('process-recommendation-job worker moves job to completed', async () => {
  const store = new InMemoryRecommendationStore();
  setRecommendationStore(store);

  const accepted = await store.enqueueInput('11111111-1111-4111-8111-111111111111', {
    idempotencyKey: 'ios-device-01:key-0001',
    type: 'PHOTO',
    imageUrl: 'https://example.com/crop.jpg',
  });

  const event: SQSEvent = {
    Records: [
      {
        messageId: 'm1',
        receiptHandle: 'rh',
        body: JSON.stringify({
          messageType: 'recommendation.job.requested',
          messageVersion: '1',
          requestedAt: new Date().toISOString(),
          userId: '11111111-1111-4111-8111-111111111111',
          inputId: accepted.inputId,
          jobId: accepted.jobId,
        }),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: String(Date.now()),
          SenderId: 'test',
          ApproximateFirstReceiveTimestamp: String(Date.now()),
        },
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:ca-west-1:123456789012:queue',
        awsRegion: 'ca-west-1',
      },
    ],
  };

  const response = await handler(event, {} as any, () => undefined);
  assert.equal(response.batchItemFailures.length, 0);

  const status = await store.getJobStatus(accepted.jobId, '11111111-1111-4111-8111-111111111111');
  assert.equal(status?.status, 'completed');
  assert.ok(status?.result);
  assert.equal(status?.result?.modelUsed, 'rag-v2-scaffold');
});
