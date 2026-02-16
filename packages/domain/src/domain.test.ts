import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIdempotencyKey,
  canTransitionJobStatus,
  decodeSyncCursor,
  encodeSyncCursor,
  isTerminalJobStatus,
  nextJobStatus,
} from './index';

test('job status transitions follow pipeline order', () => {
  assert.equal(canTransitionJobStatus('queued', 'retrieving_context'), true);
  assert.equal(canTransitionJobStatus('queued', 'generating_recommendation'), false);
  assert.equal(canTransitionJobStatus('generating_recommendation', 'failed'), true);
  assert.equal(canTransitionJobStatus('completed', 'failed'), false);
});

test('nextJobStatus returns correct next status', () => {
  assert.equal(nextJobStatus('queued'), 'retrieving_context');
  assert.equal(nextJobStatus('persisting_result'), 'completed');
  assert.equal(nextJobStatus('failed'), 'failed');
  assert.equal(isTerminalJobStatus('failed'), true);
});

test('idempotency key generation creates deterministic value with seed', () => {
  const keyA = buildIdempotencyKey('ios-device-01', 'abc');
  const keyB = buildIdempotencyKey('ios-device-01', 'abc');
  assert.equal(keyA, keyB);
  assert.match(keyA, /^ios-device-01:[a-f0-9]{20}$/);
});

test('sync cursor can round trip encode/decode', () => {
  const cursor = encodeSyncCursor({
    createdAt: '2026-02-16T12:00:00.000Z',
    inputId: '8b679b28-877f-48db-b3c6-b4e50273ef79',
  });

  const parsed = decodeSyncCursor(cursor);
  assert.equal(parsed.createdAt, '2026-02-16T12:00:00.000Z');
  assert.equal(parsed.inputId, '8b679b28-877f-48db-b3c6-b4e50273ef79');
});
