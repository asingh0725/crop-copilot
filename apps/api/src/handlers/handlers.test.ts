import test from 'node:test';
import assert from 'node:assert/strict';
import { handler as healthHandler } from './health';
import { buildCreateInputHandler } from './create-input';
import { buildGetJobStatusHandler } from './get-job-status';
import { buildSyncPullHandler } from './sync-pull';
import { setRecommendationStore } from '../lib/store';
import { AuthError } from '../auth/errors';
import type { RecommendationQueue } from '../queue/recommendation-queue';

function parseBody<T>(body: string | undefined): T {
  assert.ok(body, 'response body is missing');
  return JSON.parse(body) as T;
}

test('health handler returns 200', async () => {
  const response = await healthHandler({} as any, {} as any, () => undefined);
  assert.equal(response.statusCode, 200);
  const body = parseBody<{ status: string }>(response.body);
  assert.equal(body.status, 'ok');
});

test('create input returns 202 and job id, then get status returns queued', async () => {
  setRecommendationStore(null);
  const authVerifier = async () => ({
    userId: '11111111-1111-4111-8111-111111111111',
    scopes: ['recommendation:write'],
  });
  let published = 0;
  let lastPublishedTraceId: string | undefined;
  const queue: RecommendationQueue = {
    publishRecommendationJob: async (message) => {
      published += 1;
      lastPublishedTraceId = message.traceId;
    },
  };
  const createInputHandler = buildCreateInputHandler(authVerifier, queue);
  const getJobStatusHandler = buildGetJobStatusHandler(authVerifier);

  const createRes = await createInputHandler(
    {
      body: JSON.stringify({
        idempotencyKey: 'ios-device-01:abc12345',
        type: 'PHOTO',
        imageUrl: 'https://example.com/image.jpg',
      }),
      headers: { authorization: 'Bearer fake-token' },
      requestContext: {
        requestId: 'req-test-001',
      },
    } as any,
    {} as any,
    () => undefined
  );

  assert.equal(createRes.statusCode, 202);

  const accepted = parseBody<{ jobId: string; inputId: string }>(createRes.body);
  assert.ok(accepted.jobId);
  assert.ok(accepted.inputId);
  assert.equal(published, 1);
  assert.equal(lastPublishedTraceId, 'req-test-001');

  const statusRes = await getJobStatusHandler(
    {
      pathParameters: {
        jobId: accepted.jobId,
      },
      headers: {},
    } as any,
    {} as any,
    () => undefined
  );

  assert.equal(statusRes.statusCode, 200);
  const statusBody = parseBody<{ status: string }>(statusRes.body);
  assert.equal(statusBody.status, 'queued');
});

test('create input returns 400 for invalid body', async () => {
  setRecommendationStore(null);
  const createInputHandler = buildCreateInputHandler(
    async () => ({
      userId: '11111111-1111-4111-8111-111111111111',
      scopes: ['recommendation:write'],
    }),
    {
      publishRecommendationJob: async () => undefined,
    }
  );

  const response = await createInputHandler(
    {
      body: JSON.stringify({
        type: 'PHOTO',
      }),
      headers: {},
    } as any,
    {} as any,
    () => undefined
  );

  assert.equal(response.statusCode, 400);
  const body = parseBody<{ error: { code: string } }>(response.body);
  assert.equal(body.error.code, 'BAD_REQUEST');
});

test('create input returns 401 for failed auth', async () => {
  setRecommendationStore(null);
  const createInputHandler = buildCreateInputHandler(
    async () => {
      throw new AuthError('Token missing');
    },
    {
      publishRecommendationJob: async () => undefined,
    }
  );

  const response = await createInputHandler(
    {
      body: JSON.stringify({
        idempotencyKey: 'ios-device-01:abc12345',
        type: 'PHOTO',
      }),
      headers: {},
    } as any,
    {} as any,
    () => undefined
  );

  assert.equal(response.statusCode, 401);
});

test('create input returns 500 when queue publish fails', async () => {
  setRecommendationStore(null);
  const createInputHandler = buildCreateInputHandler(
    async () => ({
      userId: '11111111-1111-4111-8111-111111111111',
      scopes: ['recommendation:write'],
    }),
    {
      publishRecommendationJob: async () => {
        throw new Error('queue unavailable');
      },
    }
  );

  const response = await createInputHandler(
    {
      body: JSON.stringify({
        idempotencyKey: 'ios-device-01:abc12345',
        type: 'PHOTO',
      }),
      headers: { authorization: 'Bearer fake-token' },
    } as any,
    {} as any,
    () => undefined
  );

  assert.equal(response.statusCode, 500);
  const body = parseBody<{ error: { code: string } }>(response.body);
  assert.equal(body.error.code, 'PIPELINE_ENQUEUE_FAILED');
});

test('create input is idempotent for repeated key submissions', async () => {
  setRecommendationStore(null);
  const authVerifier = async () => ({
    userId: '11111111-1111-4111-8111-111111111111',
    scopes: ['recommendation:write'],
  });
  let published = 0;
  const createInputHandler = buildCreateInputHandler(authVerifier, {
    publishRecommendationJob: async () => {
      published += 1;
    },
  });

  const first = await createInputHandler(
    {
      body: JSON.stringify({
        idempotencyKey: 'ios-device-01:idempotent-key',
        type: 'PHOTO',
      }),
      headers: { authorization: 'Bearer fake-token' },
    } as any,
    {} as any,
    () => undefined
  );
  const second = await createInputHandler(
    {
      body: JSON.stringify({
        idempotencyKey: 'IOS-DEVICE-01:IDEMPOTENT-KEY',
        type: 'PHOTO',
      }),
      headers: { authorization: 'Bearer fake-token' },
    } as any,
    {} as any,
    () => undefined
  );

  const firstBody = parseBody<{ inputId: string; jobId: string }>(first.body);
  const secondBody = parseBody<{ inputId: string; jobId: string }>(second.body);
  assert.equal(firstBody.inputId, secondBody.inputId);
  assert.equal(firstBody.jobId, secondBody.jobId);
  assert.equal(published, 2);
});

test('sync pull returns paginated records and supports cursor', async () => {
  setRecommendationStore(null);
  const authVerifier = async () => ({
    userId: '11111111-1111-4111-8111-111111111111',
    scopes: ['recommendation:read'],
  });
  const queue: RecommendationQueue = {
    publishRecommendationJob: async () => undefined,
  };
  const createInputHandler = buildCreateInputHandler(authVerifier, queue);
  const syncPullHandler = buildSyncPullHandler(authVerifier);

  await createInputHandler(
    {
      body: JSON.stringify({
        idempotencyKey: 'ios-device-01:sync-a',
        type: 'PHOTO',
      }),
      headers: { authorization: 'Bearer fake-token' },
    } as any,
    {} as any,
    () => undefined
  );
  await createInputHandler(
    {
      body: JSON.stringify({
        idempotencyKey: 'ios-device-01:sync-b',
        type: 'LAB_REPORT',
      }),
      headers: { authorization: 'Bearer fake-token' },
    } as any,
    {} as any,
    () => undefined
  );

  const pageOne = await syncPullHandler(
    {
      queryStringParameters: {
        limit: '1',
      },
      headers: { authorization: 'Bearer fake-token' },
    } as any,
    {} as any,
    () => undefined
  );
  assert.equal(pageOne.statusCode, 200);
  const pageOneBody = parseBody<{
    items: Array<{ inputId: string }>;
    nextCursor: string | null;
    hasMore: boolean;
  }>(pageOne.body);
  assert.equal(pageOneBody.items.length, 1);
  assert.equal(pageOneBody.hasMore, true);
  assert.ok(pageOneBody.nextCursor);

  const pageTwo = await syncPullHandler(
    {
      queryStringParameters: {
        limit: '1',
        cursor: pageOneBody.nextCursor ?? undefined,
      },
      headers: { authorization: 'Bearer fake-token' },
    } as any,
    {} as any,
    () => undefined
  );
  assert.equal(pageTwo.statusCode, 200);
  const pageTwoBody = parseBody<{
    items: Array<{ inputId: string }>;
    hasMore: boolean;
  }>(pageTwo.body);
  assert.equal(pageTwoBody.items.length, 1);
  assert.notEqual(pageTwoBody.items[0].inputId, pageOneBody.items[0].inputId);
  assert.equal(pageTwoBody.hasMore, false);
});

test('sync pull returns 400 when cursor is invalid', async () => {
  setRecommendationStore(null);
  const authVerifier = async () => ({
    userId: '11111111-1111-4111-8111-111111111111',
    scopes: ['recommendation:read'],
  });
  const syncPullHandler = buildSyncPullHandler(authVerifier);

  const response = await syncPullHandler(
    {
      queryStringParameters: {
        cursor: 'not-base64',
      },
      headers: { authorization: 'Bearer fake-token' },
    } as any,
    {} as any,
    () => undefined
  );

  assert.equal(response.statusCode, 400);
  const body = parseBody<{ error: { code: string } }>(response.body);
  assert.equal(body.error.code, 'BAD_REQUEST');
});
