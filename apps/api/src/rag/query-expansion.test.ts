import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRetrievalQuery } from './query-expansion';

test('expandRetrievalQuery adds domain expansions and context hints', () => {
  const result = expandRetrievalQuery({
    query: 'tomato blight and chlorosis',
    crop: 'Tomato',
    region: 'California',
    growthStage: 'flowering',
  });

  assert.ok(result.terms.includes('fungal disease'));
  assert.ok(result.terms.includes('yellowing leaves'));
  assert.ok(result.terms.includes('tomato'));
  assert.ok(result.terms.includes('california'));
});
