import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CreateInputCommandSchema,
  CreateUploadUrlRequestSchema,
  IngestionBatchMessageSchema,
  RecommendationJobRequestedSchema,
  RecommendationJobStatusResponseSchema,
  SyncPullRequestSchema,
  SyncPullResponseSchema,
} from './index';

test('CreateInputCommandSchema validates expected payload', () => {
  const value = CreateInputCommandSchema.parse({
    idempotencyKey: 'ios-device-01:1739586',
    type: 'PHOTO',
    imageUrl: 'https://example.com/crop.jpg',
    description: 'Leaf spot and yellow halo',
    crop: 'Tomato',
    location: 'CA',
  });

  assert.equal(value.type, 'PHOTO');
  assert.equal(value.crop, 'Tomato');
});

test('RecommendationJobStatusResponseSchema allows completed job with result', () => {
  const parsed = RecommendationJobStatusResponseSchema.parse({
    inputId: 'd3d62e25-5a03-4691-aa42-6de8ce6f0b5b',
    jobId: 'f412cbaf-2f60-414b-9804-715f5c3b89ef',
    status: 'completed',
    updatedAt: '2026-02-16T12:00:00.000Z',
    result: {
      recommendationId: '8b679b28-877f-48db-b3c6-b4e50273ef79',
      confidence: 0.82,
      diagnosis: { condition: 'Late blight' },
      sources: [
        {
          chunkId: 'chunk-123',
          relevance: 0.91,
          excerpt: 'Late blight presents with water-soaked lesions.',
        },
      ],
      modelUsed: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    },
  });

  assert.equal(parsed.status, 'completed');
  assert.ok(parsed.result);
});

test('SyncPullResponseSchema requires server timestamp and next cursor', () => {
  const parsed = SyncPullResponseSchema.parse({
    items: [],
    nextCursor: null,
    hasMore: false,
    serverTimestamp: '2026-02-16T12:00:00.000Z',
  });

  assert.equal(parsed.hasMore, false);
});

test('SyncPullRequestSchema applies defaults for mobile poll requests', () => {
  const parsed = SyncPullRequestSchema.parse({
    limit: '25',
  });

  assert.equal(parsed.limit, 25);
  assert.equal(parsed.includeCompletedJobs, true);
});

test('SyncPullRequestSchema parses includeCompletedJobs query string', () => {
  const parsed = SyncPullRequestSchema.parse({
    includeCompletedJobs: 'false',
  });

  assert.equal(parsed.includeCompletedJobs, false);
});

test('CreateUploadUrlRequestSchema validates upload payload', () => {
  const parsed = CreateUploadUrlRequestSchema.parse({
    fileName: 'leaf-photo.jpg',
    contentType: 'image/jpeg',
    contentLength: 1024,
  });

  assert.equal(parsed.fileName, 'leaf-photo.jpg');
  assert.equal(parsed.contentType, 'image/jpeg');
});

test('CreateUploadUrlRequestSchema requires contentLength', () => {
  assert.throws(() =>
    CreateUploadUrlRequestSchema.parse({
      fileName: 'leaf-photo.jpg',
      contentType: 'image/jpeg',
    })
  );
});

test('RecommendationJobRequestedSchema validates queue message', () => {
  const parsed = RecommendationJobRequestedSchema.parse({
    messageType: 'recommendation.job.requested',
    messageVersion: '1',
    requestedAt: '2026-02-16T12:00:00.000Z',
    userId: '11111111-1111-4111-8111-111111111111',
    inputId: 'd3d62e25-5a03-4691-aa42-6de8ce6f0b5b',
    jobId: 'f412cbaf-2f60-414b-9804-715f5c3b89ef',
  });

  assert.equal(parsed.messageType, 'recommendation.job.requested');
});

test('IngestionBatchMessageSchema validates batch ingestion request', () => {
  const parsed = IngestionBatchMessageSchema.parse({
    messageType: 'ingestion.batch.requested',
    messageVersion: '1',
    requestedAt: '2026-02-16T12:00:00.000Z',
    sources: [
      {
        sourceId: 'uc-extension-tomato',
        url: 'https://extension.example.edu/tomato-blight',
        priority: 'high',
        freshnessHours: 24,
        tags: ['tomato', 'disease'],
      },
    ],
  });

  assert.equal(parsed.sources[0].priority, 'high');
});

test('SyncPullRequestSchema parses includeCompletedJobs=false correctly', () => {
  const parsed = SyncPullRequestSchema.parse({
    includeCompletedJobs: 'false',
    limit: '10',
  });

  assert.equal(parsed.includeCompletedJobs, false);
  assert.equal(parsed.limit, 10);
});

test('SyncPullRequestSchema parses includeCompletedJobs=0 correctly', () => {
  const parsed = SyncPullRequestSchema.parse({
    includeCompletedJobs: '0',
  });

  assert.equal(parsed.includeCompletedJobs, false);
});
