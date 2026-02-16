import test from 'node:test';
import assert from 'node:assert/strict';
import type { SQSEvent } from 'aws-lambda';
import { buildProcessRecommendationJobHandler } from './process-recommendation-job';
import { InMemoryRecommendationStore } from '../lib/store';

test('process-recommendation-job worker moves job to completed', async () => {
  const store = new InMemoryRecommendationStore();
  let publishedEvents = 0;
  const metrics: Array<{ status: string }> = [];
  const handler = buildProcessRecommendationJobHandler(
    store,
    async () => ({
      recommendationId: 'b6c17a92-4fb6-44d8-90e7-6af8fd6f5a09',
      confidence: 0.88,
      diagnosis: { condition: 'test' },
      sources: [],
      modelUsed: 'rag-v2-scaffold',
    }),
    {
      publishRecommendationReady: async () => {
        publishedEvents += 1;
      },
    },
    (payload) => {
      metrics.push(payload);
    }
  );

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
  assert.equal(publishedEvents, 1);
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].status, 'completed');
});

test('process-recommendation-job skips processing for already completed jobs', async () => {
  const store = new InMemoryRecommendationStore();
  const accepted = await store.enqueueInput('11111111-1111-4111-8111-111111111111', {
    idempotencyKey: 'ios-device-01:key-0002',
    type: 'PHOTO',
  });
  await store.updateJobStatus(accepted.jobId, '11111111-1111-4111-8111-111111111111', 'completed');

  let pipelineInvocations = 0;
  let publishedEvents = 0;
  const metrics: Array<{ status: string }> = [];
  const handler = buildProcessRecommendationJobHandler(
    store,
    async () => {
      pipelineInvocations += 1;
      return {
        recommendationId: '669e6f95-8b85-4b78-8518-c4bc3794f7ab',
        confidence: 0.5,
        diagnosis: { condition: 'should-not-run' },
        sources: [],
        modelUsed: 'test',
      };
    },
    {
      publishRecommendationReady: async () => {
        publishedEvents += 1;
      },
    },
    (payload) => {
      metrics.push(payload);
    }
  );

  const event: SQSEvent = {
    Records: [
      {
        messageId: 'm2',
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
  assert.equal(pipelineInvocations, 0);
  assert.equal(publishedEvents, 0);
  assert.equal(metrics.length, 0);
});

test('process-recommendation-job does not fail batch when push publish fails', async () => {
  const store = new InMemoryRecommendationStore();
  const accepted = await store.enqueueInput('11111111-1111-4111-8111-111111111111', {
    idempotencyKey: 'ios-device-01:key-0003',
    type: 'PHOTO',
  });

  const metrics: Array<{ status: string }> = [];
  const handler = buildProcessRecommendationJobHandler(
    store,
    async () => ({
      recommendationId: '6fc66603-c4d8-47a3-8e21-52a434112b4c',
      confidence: 0.75,
      diagnosis: { condition: 'ok' },
      sources: [],
      modelUsed: 'rag-v2-scaffold',
    }),
    {
      publishRecommendationReady: async () => {
        throw new Error('sns unavailable');
      },
    },
    (payload) => {
      metrics.push(payload);
    }
  );

  const event: SQSEvent = {
    Records: [
      {
        messageId: 'm3',
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
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].status, 'completed');
});

test('process-recommendation-job reports failed metrics when pipeline throws', async () => {
  const store = new InMemoryRecommendationStore();
  const accepted = await store.enqueueInput('11111111-1111-4111-8111-111111111111', {
    idempotencyKey: 'ios-device-01:key-0004',
    type: 'PHOTO',
  });
  const metrics: Array<{ status: string }> = [];
  const handler = buildProcessRecommendationJobHandler(
    store,
    async () => {
      throw new Error('pipeline crashed');
    },
    {
      publishRecommendationReady: async () => undefined,
    },
    (payload) => {
      metrics.push(payload);
    }
  );

  const event: SQSEvent = {
    Records: [
      {
        messageId: 'm4',
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
  assert.equal(response.batchItemFailures.length, 1);
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].status, 'failed');

  const status = await store.getJobStatus(accepted.jobId, '11111111-1111-4111-8111-111111111111');
  assert.equal(status?.status, 'failed');
});
