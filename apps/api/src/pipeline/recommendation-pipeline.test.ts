import test from 'node:test';
import assert from 'node:assert/strict';
import { runRecommendationPipeline } from './recommendation-pipeline';

test('runRecommendationPipeline returns ranked recommendation payload', async () => {
  const result = await runRecommendationPipeline({
    inputId: 'd3d62e25-5a03-4691-aa42-6de8ce6f0b5b',
    userId: '11111111-1111-4111-8111-111111111111',
    jobId: 'f412cbaf-2f60-414b-9804-715f5c3b89ef',
  });

  assert.equal(result.modelUsed, 'rag-v2-scaffold');
  assert.ok(result.sources.length > 0);
  assert.equal(
    (result.diagnosis.diagnosis as { condition: string }).condition,
    'probable_foliar_disease'
  );
});
