import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSignal } from './feedback-learning';

test('computeSignal returns strong positive for successful outcomes', () => {
  const signal = computeSignal({
    helpful: false,
    rating: 1,
    accuracy: 1,
    outcomeSuccess: true,
  });

  assert.equal(signal, 2);
});

test('computeSignal returns strong negative for failed outcomes', () => {
  const signal = computeSignal({
    helpful: true,
    rating: 5,
    accuracy: 5,
    outcomeSuccess: false,
  });

  assert.equal(signal, -2);
});

test('computeSignal combines helpful, rating, and accuracy signals', () => {
  const positive = computeSignal({
    helpful: true,
    rating: 4,
    accuracy: 5,
  });
  assert.equal(positive, 2);

  const negative = computeSignal({
    helpful: false,
    rating: 1,
    accuracy: 2,
  });
  assert.equal(negative, -2);
});

test('computeSignal returns neutral for mixed or missing feedback', () => {
  const mixed = computeSignal({
    helpful: true,
    rating: 1,
    accuracy: 3,
  });
  assert.equal(mixed, 0);

  const none = computeSignal({});
  assert.equal(none, 0);
});
