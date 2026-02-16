import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecommendationMetricLog,
  emitRecommendationMetrics,
} from './recommendation-metrics';

test('buildRecommendationMetricLog returns EMF payload for completed jobs', () => {
  const payload = buildRecommendationMetricLog(
    {
      status: 'completed',
      durationMs: 1420,
      estimatedCostUsd: 0.81,
      traceId: 'req-123',
      modelUsed: 'rag-v2-scaffold',
    },
    new Date('2026-02-16T12:00:00.000Z')
  );

  assert.equal(payload._aws.Timestamp, Date.parse('2026-02-16T12:00:00.000Z'));
  assert.equal(payload.RecommendationCompletedCount, 1);
  assert.equal(payload.RecommendationFailedCount, 0);
  assert.equal(payload.TraceId, 'req-123');
});

test('emitRecommendationMetrics writes structured payload to logs', () => {
  let output = '';
  const originalLog = console.log;
  console.log = (value?: unknown) => {
    output = String(value ?? '');
  };

  try {
    emitRecommendationMetrics({
      status: 'failed',
      durationMs: 250,
      estimatedCostUsd: 0.15,
    });
  } finally {
    console.log = originalLog;
  }

  const parsed = JSON.parse(output) as { Status: string; RecommendationFailedCount: number };
  assert.equal(parsed.Status, 'failed');
  assert.equal(parsed.RecommendationFailedCount, 1);
});
