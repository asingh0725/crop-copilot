import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool, PoolClient } from 'pg';
import { encodeSyncCursor } from '@crop-copilot/domain';
import { PostgresRecommendationStore } from './postgres-store';

interface QueryExpectation {
  includes: string;
  rows: Record<string, unknown>[];
  values?: unknown[];
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createScriptedPool(expectations: QueryExpectation[]): Pool {
  const queue = [...expectations];

  const runQuery = async (...args: unknown[]) => {
    const firstArg = args[0];
    const sql =
      typeof firstArg === 'string'
        ? firstArg
        : typeof firstArg === 'object' &&
            firstArg !== null &&
            'text' in firstArg &&
            typeof (firstArg as { text?: unknown }).text === 'string'
          ? ((firstArg as { text: string }).text as string)
          : '';
    const values =
      Array.isArray(args[1])
        ? args[1]
        : typeof firstArg === 'object' &&
            firstArg !== null &&
            'values' in firstArg &&
            Array.isArray((firstArg as { values?: unknown }).values)
          ? (firstArg as { values: unknown[] }).values
          : [];

    assert.ok(queue.length > 0, `unexpected query: ${normalizeSql(sql)}`);
    const next = queue.shift() as QueryExpectation;
    const normalized = normalizeSql(sql);
    assert.match(normalized, new RegExp(next.includes));
    if (next.values) {
      assert.deepEqual(values, next.values);
    }
    return { rows: next.rows } as any;
  };

  const client = {
    query: runQuery,
    release() {
      return undefined;
    },
  } as unknown as PoolClient;

  return {
    connect: async () => client as PoolClient,
    query: runQuery,
  } as Pool;
}

test('PostgresRecommendationStore returns existing job for idempotent retries', async () => {
  const acceptedAt = new Date('2026-02-16T12:00:00.000Z');
  const pool = createScriptedPool([
    { includes: '^BEGIN$', rows: [] },
    { includes: 'INSERT INTO app_input_command', rows: [] },
    {
      includes: 'SELECT i.id AS input_id',
      rows: [
        {
          input_id: '31d57059-e6ce-4f89-a061-937eddf591d4',
          job_id: 'deab17cf-f109-43f2-b95b-7d2f328a7720',
          status: 'queued',
          accepted_at: acceptedAt,
        },
      ],
    },
    { includes: '^COMMIT$', rows: [] },
  ]);
  const store = new PostgresRecommendationStore(pool);

  const accepted = await store.enqueueInput('11111111-1111-1111-1111-111111111111', {
    idempotencyKey: 'ios-device-01:retrykey1',
    type: 'PHOTO',
    imageUrl: 'https://example.com/image.jpg',
  });

  assert.equal(accepted.inputId, '31d57059-e6ce-4f89-a061-937eddf591d4');
  assert.equal(accepted.jobId, 'deab17cf-f109-43f2-b95b-7d2f328a7720');
  assert.equal(accepted.status, 'queued');
  assert.equal(accepted.acceptedAt, acceptedAt.toISOString());
  assert.equal(accepted.wasCreated, false);
});

test('PostgresRecommendationStore inserts job for new input commands', async () => {
  const acceptedAt = new Date('2026-02-16T13:00:00.000Z');
  const pool = createScriptedPool([
    { includes: '^BEGIN$', rows: [] },
    {
      includes: 'INSERT INTO app_input_command',
      rows: [
        {
          input_id: '9f2644c5-a906-4739-9fca-a6f4078dc8c7',
          created_at: acceptedAt,
        },
      ],
    },
    { includes: 'INSERT INTO "User"', rows: [] },
    { includes: 'INSERT INTO "Input"', rows: [] },
    { includes: 'INSERT INTO app_recommendation_job', rows: [] },
    { includes: '^COMMIT$', rows: [] },
  ]);
  const store = new PostgresRecommendationStore(pool);

  const accepted = await store.enqueueInput('11111111-1111-1111-1111-111111111111', {
    idempotencyKey: 'ios-device-01:newkey123',
    type: 'PHOTO',
    imageUrl: 'https://example.com/image.jpg',
  });

  assert.equal(accepted.inputId, '9f2644c5-a906-4739-9fca-a6f4078dc8c7');
  assert.equal(accepted.status, 'queued');
  assert.equal(accepted.acceptedAt, acceptedAt.toISOString());
  assert.equal(accepted.wasCreated, true);
  assert.match(
    accepted.jobId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
});

test('PostgresRecommendationStore pullSyncRecords returns paginated results', async () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const createdAtA = new Date('2026-02-16T13:00:00.000Z');
  const inputUpdatedAtA = new Date('2026-02-16T13:00:01.000Z');
  const jobUpdatedAtA = new Date('2026-02-16T13:00:05.000Z');
  const createdAtB = new Date('2026-02-16T12:00:00.000Z');
  const inputUpdatedAtB = new Date('2026-02-16T12:00:02.000Z');
  const jobUpdatedAtB = new Date('2026-02-16T12:00:03.000Z');

  const pool = createScriptedPool([
    {
      includes:
        'SELECT i.id AS input_id, i.created_at AS input_created_at, i.updated_at AS input_updated_at, j.updated_at AS job_updated_at',
      values: [userId, 2],
      rows: [
        {
          input_id: '9f2644c5-a906-4739-9fca-a6f4078dc8c7',
          input_created_at: createdAtA,
          input_updated_at: inputUpdatedAtA,
          job_updated_at: jobUpdatedAtA,
          input_type: 'PHOTO',
          crop: 'corn',
          location: 'CA',
          status: 'completed',
          recommendation_id: 'deab17cf-f109-43f2-b95b-7d2f328a7720',
        },
        {
          input_id: '31d57059-e6ce-4f89-a061-937eddf591d4',
          input_created_at: createdAtB,
          input_updated_at: inputUpdatedAtB,
          job_updated_at: jobUpdatedAtB,
          input_type: 'LAB_REPORT',
          crop: 'wheat',
          location: 'AB',
          status: 'queued',
          recommendation_id: null,
        },
      ],
    },
  ]);
  const store = new PostgresRecommendationStore(pool);

  const response = await store.pullSyncRecords(userId, {
    limit: 1,
    includeCompletedJobs: true,
  });

  assert.equal(response.items.length, 1);
  assert.equal(response.items[0].inputId, '9f2644c5-a906-4739-9fca-a6f4078dc8c7');
  assert.equal(response.items[0].updatedAt, jobUpdatedAtA.toISOString());
  assert.equal(response.hasMore, true);
  assert.ok(response.nextCursor);
});

test('PostgresRecommendationStore pullSyncRecords applies cursor and includeCompleted filter', async () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const cursor = encodeSyncCursor({
    createdAt: '2026-02-16T12:00:00.000Z',
    inputId: '31d57059-e6ce-4f89-a061-937eddf591d4',
  });
  const createdAt = new Date('2026-02-16T11:00:00.000Z');
  const updatedAt = new Date('2026-02-16T11:00:02.000Z');

  const pool = createScriptedPool([
    {
      includes:
        'WHERE i.user_id = \\$1 AND j.status <> \\$2 AND \\(i.created_at < \\$3::timestamptz OR \\(i.created_at = \\$3::timestamptz AND i.id < \\$4::uuid\\)\\)',
      values: [
        userId,
        'completed',
        '2026-02-16T12:00:00.000Z',
        '31d57059-e6ce-4f89-a061-937eddf591d4',
        3,
      ],
      rows: [
        {
          input_id: '0eaf17cf-f109-43f2-b95b-7d2f328a7721',
          input_created_at: createdAt,
          input_updated_at: updatedAt,
          job_updated_at: updatedAt,
          input_type: 'PHOTO',
          crop: null,
          location: null,
          status: 'queued',
          recommendation_id: null,
        },
      ],
    },
  ]);
  const store = new PostgresRecommendationStore(pool);

  const response = await store.pullSyncRecords(userId, {
    limit: 2,
    includeCompletedJobs: false,
    cursor,
  });

  assert.equal(response.items.length, 1);
  assert.equal(response.items[0].status, 'queued');
  assert.equal(response.hasMore, false);
  assert.equal(response.nextCursor, null);
});

test('PostgresRecommendationStore pullSyncRecords throws for invalid cursor', async () => {
  const pool = createScriptedPool([]);
  const store = new PostgresRecommendationStore(pool);

  await assert.rejects(
    () =>
      store.pullSyncRecords('11111111-1111-1111-1111-111111111111', {
        limit: 2,
        includeCompletedJobs: true,
        cursor: 'not-a-valid-cursor',
      }),
    /Invalid sync cursor/
  );
});

test('PostgresRecommendationStore persists recommendation payload into legacy tables', async () => {
  const pool = createScriptedPool([
    { includes: '^BEGIN$', rows: [] },
    {
      includes: 'UPDATE app_recommendation_job',
      rows: [{ input_id: '9f2644c5-a906-4739-9fca-a6f4078dc8c7' }],
    },
    {
      includes: 'SELECT id FROM "Recommendation" WHERE "inputId"',
      rows: [],
    },
    {
      includes: 'INSERT INTO "Recommendation"',
      rows: [],
    },
    {
      includes: 'DELETE FROM "RecommendationSource"',
      rows: [],
    },
    {
      includes: 'SELECT EXISTS \\(SELECT 1 FROM "TextChunk"',
      rows: [{ has_text: false, has_image: false }],
    },
    {
      includes: 'INSERT INTO "Source"',
      rows: [],
    },
    {
      includes: 'INSERT INTO "TextChunk"',
      rows: [],
    },
    {
      includes: 'INSERT INTO "RecommendationSource"',
      rows: [],
    },
    {
      includes: 'DELETE FROM "ProductRecommendation"',
      rows: [],
    },
    {
      includes: 'SELECT crop FROM "Input"',
      rows: [{ crop: 'corn' }],
    },
    {
      includes: 'SELECT id, name, brand, type::text AS type',
      rows: [],
    },
    {
      includes: 'ORDER BY "updatedAt" DESC LIMIT \\$1',
      rows: [],
    },
    { includes: '^COMMIT$', rows: [] },
  ]);

  const store = new PostgresRecommendationStore(pool);

  await store.saveRecommendationResult(
    'deab17cf-f109-43f2-b95b-7d2f328a7720',
    '11111111-1111-1111-1111-111111111111',
    {
      recommendationId: '1d57059e-e6ce-4f89-a061-937eddf591d4',
      confidence: 0.82,
      diagnosis: { summary: 'test' },
      modelUsed: 'rag-v2-scaffold',
      sources: [
        {
          chunkId: 'missing-chunk-id',
          relevance: 0.62,
          excerpt: 'no-op',
        },
      ],
    }
  );
});

test('PostgresRecommendationStore persists precomputed product recommendations', async () => {
  const pool = createScriptedPool([
    { includes: '^BEGIN$', rows: [] },
    {
      includes: 'UPDATE app_recommendation_job',
      rows: [{ input_id: '9f2644c5-a906-4739-9fca-a6f4078dc8c7' }],
    },
    {
      includes: 'SELECT id FROM "Recommendation" WHERE "inputId"',
      rows: [{ id: '1d57059e-e6ce-4f89-a061-937eddf591d4' }],
    },
    {
      includes: 'UPDATE "Recommendation"',
      rows: [],
    },
    {
      includes: 'DELETE FROM "RecommendationSource"',
      rows: [],
    },
    {
      includes: 'DELETE FROM "ProductRecommendation"',
      rows: [],
    },
    {
      includes: 'SELECT crop FROM "Input"',
      rows: [{ crop: 'corn' }],
    },
    {
      includes: 'WHERE id = ANY\\(\\$1::text\\[\\]\\)',
      rows: [
        {
          id: 'prod-1',
          name: 'Corn Guard',
          brand: 'Acme',
          type: 'FUNGICIDE',
          application_rate: '1 qt/ac',
          description: 'Protective foliar fungicide.',
        },
      ],
    },
    {
      includes: 'INSERT INTO "ProductRecommendation"',
      rows: [],
    },
    { includes: '^COMMIT$', rows: [] },
  ]);

  const store = new PostgresRecommendationStore(pool);

  await store.saveRecommendationResult(
    'deab17cf-f109-43f2-b95b-7d2f328a7720',
    '11111111-1111-1111-1111-111111111111',
    {
      recommendationId: '1d57059e-e6ce-4f89-a061-937eddf591d4',
      confidence: 0.82,
      diagnosis: {
        diagnosis: {
          condition: 'northern corn leaf blight',
          conditionType: 'disease',
        },
        products: [
          {
            productId: 'prod-1',
            reason: 'Targets foliar disease pressure.',
            applicationRate: '1 qt/ac',
          },
        ],
      },
      modelUsed: 'rag-v2-scaffold',
      sources: [],
    }
  );
});

test('PostgresRecommendationStore resolves diagnosis products by product name aliases', async () => {
  const pool = createScriptedPool([
    { includes: '^BEGIN$', rows: [] },
    {
      includes: 'UPDATE app_recommendation_job',
      rows: [{ input_id: '9f2644c5-a906-4739-9fca-a6f4078dc8c7' }],
    },
    {
      includes: 'SELECT id FROM "Recommendation" WHERE "inputId"',
      rows: [{ id: '1d57059e-e6ce-4f89-a061-937eddf591d4' }],
    },
    {
      includes: 'UPDATE "Recommendation"',
      rows: [],
    },
    {
      includes: 'DELETE FROM "RecommendationSource"',
      rows: [],
    },
    {
      includes: 'DELETE FROM "ProductRecommendation"',
      rows: [],
    },
    {
      includes: 'SELECT crop FROM "Input"',
      rows: [{ crop: 'corn' }],
    },
    {
      includes: 'WHERE lower\\(name\\) = ANY\\(\\$1::text\\[\\]\\)',
      rows: [
        {
          id: 'prod-2',
          name: 'Corn Guard',
          brand: 'Acme',
          type: 'FUNGICIDE',
          application_rate: '1.5 qt/ac',
          description: 'Broad-spectrum disease management',
        },
      ],
    },
    {
      includes: 'INSERT INTO "ProductRecommendation"',
      rows: [],
    },
    { includes: '^COMMIT$', rows: [] },
  ]);

  const store = new PostgresRecommendationStore(pool);

  await store.saveRecommendationResult(
    'deab17cf-f109-43f2-b95b-7d2f328a7720',
    '11111111-1111-1111-1111-111111111111',
    {
      recommendationId: '1d57059e-e6ce-4f89-a061-937eddf591d4',
      confidence: 0.79,
      diagnosis: {
        diagnosis: {
          condition: 'northern corn leaf blight',
          conditionType: 'disease',
        },
        productRecommendations: [
          {
            product_name: 'Corn Guard',
            reason: 'Matches foliar disease pressure.',
            application_rate: '1.5 qt/ac',
          },
        ],
      },
      modelUsed: 'rag-v2-scaffold',
      sources: [],
    } as any
  );
});
