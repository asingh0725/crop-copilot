import test from 'node:test';
import assert from 'node:assert/strict';
import { handler as healthHandler } from './health';
import { buildCreateInputHandler } from './create-input';
import { buildGetJobStatusHandler } from './get-job-status';
import { buildSyncPullHandler } from './sync-pull';
import type { RecommendationStore } from '../lib/store';
import { setRecommendationStore } from '../lib/store';
import { AuthError } from '../auth/errors';
import type { RecommendationQueue } from '../queue/recommendation-queue';

interface HandlerResponse {
  statusCode: number;
  body?: string;
}

function asHandlerResponse(response: unknown): HandlerResponse {
  assert.ok(response && typeof response === 'object', 'handler did not return an object');
  assert.ok('statusCode' in response, 'handler response is missing statusCode');
  return response as HandlerResponse;
}

function parseBody<T>(body: string | undefined): T {
  assert.ok(body, 'response body is missing');
  return JSON.parse(body) as T;
}

test('health handler returns 200', async () => {
  const response = asHandlerResponse(
    await healthHandler({} as any, {} as any, () => undefined)
  );
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
  const queue: RecommendationQueue = {
    publishRecommendationJob: async () => {
      published += 1;
    },
  };
  const createInputHandler = buildCreateInputHandler(authVerifier, queue);
  const getJobStatusHandler = buildGetJobStatusHandler(authVerifier);

  const createRes = asHandlerResponse(
    await createInputHandler(
      {
        body: JSON.stringify({
          idempotencyKey: 'ios-device-01:abc12345',
          type: 'PHOTO',
          imageUrl: 'https://example.com/image.jpg',
        }),
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );

  assert.equal(createRes.statusCode, 202);

  const accepted = parseBody<{ jobId: string; inputId: string }>(createRes.body);
  assert.ok(accepted.jobId);
  assert.ok(accepted.inputId);
  assert.equal(published, 1);

  const statusRes = asHandlerResponse(
    await getJobStatusHandler(
      {
        pathParameters: {
          jobId: accepted.jobId,
        },
        headers: {},
      } as any,
      {} as any,
      () => undefined
    )
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

  const response = asHandlerResponse(
    await createInputHandler(
      {
        body: JSON.stringify({
          type: 'PHOTO',
        }),
        headers: {},
      } as any,
      {} as any,
      () => undefined
    )
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

  const response = asHandlerResponse(
    await createInputHandler(
      {
        body: JSON.stringify({
          idempotencyKey: 'ios-device-01:abc12345',
          type: 'PHOTO',
        }),
        headers: {},
      } as any,
      {} as any,
      () => undefined
    )
  );

  assert.equal(response.statusCode, 401);
});

test('create input idempotent retry returns same job and publishes once', async () => {
  setRecommendationStore(null);

  let published = 0;
  const queue: RecommendationQueue = {
    publishRecommendationJob: async () => {
      published += 1;
    },
  };
  const createInputHandler = buildCreateInputHandler(
    async () => ({
      userId: '33333333-3333-4333-8333-333333333333',
      scopes: ['recommendation:write'],
    }),
    queue
  );

  const event = {
    body: JSON.stringify({
      idempotencyKey: 'ios-device-02:retrykey1',
      type: 'PHOTO',
      imageUrl: 'https://example.com/image.jpg',
    }),
    headers: { authorization: 'Bearer fake-token' },
  } as any;

  const firstResponse = asHandlerResponse(
    await createInputHandler(event, {} as any, () => undefined)
  );
  const secondResponse = asHandlerResponse(
    await createInputHandler(event, {} as any, () => undefined)
  );

  const firstBody = parseBody<{ jobId: string; inputId: string }>(firstResponse.body);
  const secondBody = parseBody<{ jobId: string; inputId: string }>(secondResponse.body);

  assert.equal(firstBody.jobId, secondBody.jobId);
  assert.equal(firstBody.inputId, secondBody.inputId);
  assert.equal(published, 1);
});

test('create input idempotency key is scoped by user', async () => {
  setRecommendationStore(null);

  const body = JSON.stringify({
    idempotencyKey: 'ios-device-03:scopekey',
    type: 'PHOTO',
    imageUrl: 'https://example.com/image.jpg',
  });

  const firstHandler = buildCreateInputHandler(
    async () => ({
      userId: '44444444-4444-4444-8444-444444444444',
      scopes: ['recommendation:write'],
    }),
    { publishRecommendationJob: async () => undefined }
  );
  const secondHandler = buildCreateInputHandler(
    async () => ({
      userId: '55555555-5555-4555-8555-555555555555',
      scopes: ['recommendation:write'],
    }),
    { publishRecommendationJob: async () => undefined }
  );

  const firstResponse = asHandlerResponse(
    await firstHandler(
      {
        body,
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );
  const secondResponse = asHandlerResponse(
    await secondHandler(
      {
        body,
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );

  const first = parseBody<{ jobId: string; inputId: string }>(firstResponse.body);
  const second = parseBody<{ jobId: string; inputId: string }>(secondResponse.body);

  assert.notEqual(first.jobId, second.jobId);
  assert.notEqual(first.inputId, second.inputId);
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

  const response = asHandlerResponse(
    await createInputHandler(
      {
        body: JSON.stringify({
          idempotencyKey: 'ios-device-01:abc12345',
          type: 'PHOTO',
        }),
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );

  assert.equal(response.statusCode, 500);
  const body = parseBody<{ error: { code: string } }>(response.body);
  assert.equal(body.error.code, 'PIPELINE_ENQUEUE_FAILED');
});

test('create input returns 500 when store enqueue fails', async () => {
  const failingStore: RecommendationStore = {
    enqueueInput() {
      throw new Error('persistence unavailable');
    },
    async getJobStatus(_jobId, _userId) {
      return null;
    },
    async pullSyncRecords() {
      return {
        items: [],
        nextCursor: null,
        hasMore: false,
        serverTimestamp: new Date().toISOString(),
      };
    },
    async updateJobStatus() {
      return undefined;
    },
    async saveRecommendationResult() {
      return undefined;
    },
  };
  setRecommendationStore(failingStore);

  const createInputHandler = buildCreateInputHandler(
    async () => ({
      userId: '66666666-6666-4666-8666-666666666666',
      scopes: ['recommendation:write'],
    }),
    { publishRecommendationJob: async () => undefined }
  );

  const response = asHandlerResponse(
    await createInputHandler(
      {
        body: JSON.stringify({
          idempotencyKey: 'ios-device-04:servererr',
          type: 'PHOTO',
          imageUrl: 'https://example.com/image.jpg',
        }),
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );

  assert.equal(response.statusCode, 500);
  const bodyResponse = parseBody<{ error: { code: string } }>(response.body);
  assert.equal(bodyResponse.error.code, 'INTERNAL_SERVER_ERROR');

  setRecommendationStore(null);
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

  const pageOne = asHandlerResponse(
    await syncPullHandler(
      {
        queryStringParameters: {
          limit: '1',
        },
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
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

  const pageTwo = asHandlerResponse(
    await syncPullHandler(
      {
        queryStringParameters: {
          limit: '1',
          cursor: pageOneBody.nextCursor ?? undefined,
        },
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
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

  const response = asHandlerResponse(
    await syncPullHandler(
      {
        queryStringParameters: {
          cursor: 'not-base64',
        },
        headers: { authorization: 'Bearer fake-token' },
      } as any,
      {} as any,
      () => undefined
    )
  );

  assert.equal(response.statusCode, 400);
  const body = parseBody<{ error: { code: string } }>(response.body);
  assert.equal(body.error.code, 'BAD_REQUEST');
});
