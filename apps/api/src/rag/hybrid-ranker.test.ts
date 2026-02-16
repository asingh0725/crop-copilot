import test from 'node:test';
import assert from 'node:assert/strict';
import { rankCandidates } from './hybrid-ranker';

test('rankCandidates prioritizes authority and metadata fit', () => {
  const ranked = rankCandidates(
    [
      {
        chunkId: 'retailer-1',
        content: 'Use fungicide for tomato blight in humid weather.',
        similarity: 0.82,
        sourceType: 'RETAILER',
        sourceTitle: 'Retail blog',
        metadata: {
          crops: ['tomato'],
          region: 'california',
          topics: ['blight'],
        },
      },
      {
        chunkId: 'gov-1',
        content: 'University extension guidance for tomato blight treatment windows.',
        similarity: 0.78,
        sourceType: 'UNIVERSITY_EXTENSION',
        sourceTitle: 'UC Extension',
        metadata: {
          crops: ['tomato'],
          region: 'california',
          topics: ['blight'],
        },
      },
    ],
    {
      queryTerms: ['tomato', 'blight', 'treatment'],
      crop: 'tomato',
      region: 'california',
      topicHints: ['blight'],
    }
  );

  assert.equal(ranked[0].chunkId, 'gov-1');
  assert.ok(ranked[0].rankScore > ranked[1].rankScore);
});
