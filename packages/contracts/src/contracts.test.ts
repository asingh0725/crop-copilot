import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CreateInputCommandSchema,
  RecommendationJobStatusResponseSchema,
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
