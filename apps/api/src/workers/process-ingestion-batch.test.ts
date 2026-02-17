import test from 'node:test';
import assert from 'node:assert/strict';
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { handler } from './process-ingestion-batch';
import { InMemorySourceRegistry, setSourceRegistry } from '../ingestion/source-registry';

function asWorkerResponse(response: void | SQSBatchResponse): SQSBatchResponse {
  assert.ok(response && typeof response === 'object' && 'batchItemFailures' in response);
  return response;
}

test('process-ingestion-batch handles valid batch message', async () => {
  const registry = new InMemorySourceRegistry([
    {
      sourceId: 'source-a',
      url: 'https://example.com/a',
      priority: 'high',
      freshnessHours: 24,
      tags: [],
    },
  ]);
  setSourceRegistry(registry);

  const event: SQSEvent = {
    Records: [
      {
        messageId: 'ing-1',
        receiptHandle: 'rh',
        body: JSON.stringify({
          messageType: 'ingestion.batch.requested',
          messageVersion: '1',
          requestedAt: '2026-02-16T12:00:00.000Z',
          sources: [
            {
              sourceId: 'source-a',
              url: 'https://example.com/a',
              priority: 'high',
              freshnessHours: 24,
              tags: [],
            },
          ],
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

  const response = asWorkerResponse(await handler(event, {} as any, () => undefined));
  assert.equal(response.batchItemFailures.length, 0);
});
