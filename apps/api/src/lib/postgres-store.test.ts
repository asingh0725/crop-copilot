import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool, PoolClient } from 'pg';
import { PostgresRecommendationStore } from './postgres-store';

interface QueryExpectation {
  includes: string;
  rows: Record<string, unknown>[];
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createScriptedPool(expectations: QueryExpectation[]): Pool {
  const queue = [...expectations];

  const client = {
    async query(...args: unknown[]) {
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
      assert.ok(queue.length > 0, `unexpected query: ${normalizeSql(sql)}`);
      const next = queue.shift() as QueryExpectation;
      const normalized = normalizeSql(sql);
      assert.match(normalized, new RegExp(next.includes));
      return { rows: next.rows } as any;
    },
    release() {
      return undefined;
    },
  } as unknown as PoolClient;

  return {
    connect: async () => client as PoolClient,
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
