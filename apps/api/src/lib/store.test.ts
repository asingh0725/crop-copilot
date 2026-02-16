import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRecommendationStore } from './store';

test('InMemoryRecommendationStore enforces user scoping on job status', async () => {
  const store = new InMemoryRecommendationStore();

  const accepted = await store.enqueueInput('user-a', {
    idempotencyKey: 'ios-device-a:key-1234',
    type: 'PHOTO',
    imageUrl: 'https://example.com/photo.jpg',
  });

  const ownStatus = await store.getJobStatus(accepted.jobId, 'user-a');
  const otherStatus = await store.getJobStatus(accepted.jobId, 'user-b');

  assert.ok(ownStatus);
  assert.equal(ownStatus?.status, 'queued');
  assert.equal(otherStatus, null);

  await store.updateJobStatus(accepted.jobId, 'user-a', 'retrieving_context');
  await store.saveRecommendationResult(accepted.jobId, 'user-a', {
    recommendationId: '8b679b28-877f-48db-b3c6-b4e50273ef79',
    confidence: 0.74,
    diagnosis: { condition: 'test' },
    sources: [],
    modelUsed: 'pipeline-scaffold-v1',
  });
  await store.updateJobStatus(accepted.jobId, 'user-a', 'completed');

  const completed = await store.getJobStatus(accepted.jobId, 'user-a');
  assert.equal(completed?.status, 'completed');
  assert.equal(completed?.result?.modelUsed, 'pipeline-scaffold-v1');
});

test('InMemoryRecommendationStore marks idempotent replays as existing', async () => {
  const store = new InMemoryRecommendationStore();

  const first = await store.enqueueInput('user-a', {
    idempotencyKey: 'ios-device-a:key-8888',
    type: 'PHOTO',
    imageUrl: 'https://example.com/photo.jpg',
  });
  const second = await store.enqueueInput('user-a', {
    idempotencyKey: 'ios-device-a:key-8888',
    type: 'PHOTO',
    imageUrl: 'https://example.com/photo.jpg',
  });

  assert.equal(first.wasCreated, true);
  assert.equal(second.wasCreated, false);
  assert.equal(first.inputId, second.inputId);
  assert.equal(first.jobId, second.jobId);
});
