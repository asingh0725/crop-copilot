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
});
