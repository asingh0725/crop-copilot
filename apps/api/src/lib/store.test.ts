import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryRecommendationStore,
  resolvePoolSslConfig,
  sanitizeDatabaseUrlForPool,
} from './store';

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
    idempotencyKey: 'IOS-DEVICE-A:KEY-8888',
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

test('InMemoryRecommendationStore pullSyncRecords paginates with cursor', async () => {
  const store = new InMemoryRecommendationStore();

  const acceptedA = await store.enqueueInput('user-a', {
    idempotencyKey: 'ios-device-a:key-sync-1',
    type: 'PHOTO',
    crop: 'corn',
  });
  await store.updateJobStatus(acceptedA.jobId, 'user-a', 'completed');

  await new Promise((resolve) => setTimeout(resolve, 5));

  await store.enqueueInput('user-a', {
    idempotencyKey: 'ios-device-a:key-sync-2',
    type: 'LAB_REPORT',
    crop: 'wheat',
  });

  const pageOne = await store.pullSyncRecords('user-a', {
    limit: 1,
    includeCompletedJobs: true,
  });
  assert.equal(pageOne.items.length, 1);
  assert.equal(pageOne.hasMore, true);
  assert.ok(pageOne.nextCursor);

  const pageTwo = await store.pullSyncRecords('user-a', {
    limit: 1,
    includeCompletedJobs: true,
    cursor: pageOne.nextCursor ?? undefined,
  });
  assert.equal(pageTwo.items.length, 1);
  assert.equal(pageTwo.hasMore, false);
  assert.notEqual(pageOne.items[0].inputId, pageTwo.items[0].inputId);

  const withoutCompleted = await store.pullSyncRecords('user-a', {
    limit: 10,
    includeCompletedJobs: false,
  });
  assert.equal(withoutCompleted.items.length, 1);
  assert.equal(withoutCompleted.items[0].status, 'queued');
});

test('sanitizeDatabaseUrlForPool strips sslmode query param', () => {
  const sanitized = sanitizeDatabaseUrlForPool(
    'postgresql://user:pass@host:5432/db?sslmode=require&pgbouncer=true'
  );

  assert.equal(sanitized.includes('sslmode='), false);
  assert.equal(sanitized.includes('pgbouncer=true'), true);
});

test('resolvePoolSslConfig defaults to no-verify', () => {
  const previous = process.env.PG_SSL_MODE;
  delete process.env.PG_SSL_MODE;

  try {
    assert.deepEqual(resolvePoolSslConfig(), { rejectUnauthorized: false });
  } finally {
    if (previous === undefined) {
      delete process.env.PG_SSL_MODE;
    } else {
      process.env.PG_SSL_MODE = previous;
    }
  }
});

test('resolvePoolSslConfig supports disable and verify-full', () => {
  const previous = process.env.PG_SSL_MODE;

  try {
    process.env.PG_SSL_MODE = 'disable';
    assert.equal(resolvePoolSslConfig(), false);

    process.env.PG_SSL_MODE = 'verify-full';
    assert.deepEqual(resolvePoolSslConfig(), { rejectUnauthorized: true });
  } finally {
    if (previous === undefined) {
      delete process.env.PG_SSL_MODE;
    } else {
      process.env.PG_SSL_MODE = previous;
    }
  }
});
