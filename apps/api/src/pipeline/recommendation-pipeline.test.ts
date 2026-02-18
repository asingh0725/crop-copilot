import test from 'node:test';
import assert from 'node:assert/strict';
import { runRecommendationPipeline } from './recommendation-pipeline';

test('runRecommendationPipeline generates context-aware recommendation payload', async () => {
  const result = await runRecommendationPipeline(
    {
      inputId: 'd3d62e25-5a03-4691-aa42-6de8ce6f0b5b',
      userId: '11111111-1111-4111-8111-111111111111',
      jobId: 'f412cbaf-2f60-414b-9804-715f5c3b89ef',
    },
    {
      loadInputSnapshot: async () => ({
        type: 'PHOTO',
        crop: 'corn',
        location: 'Iowa, US',
        season: 'Vegetative',
        description:
          'Interveinal chlorosis on lower corn leaves after heavy rainfall.',
      }),
      retrieveCandidates: async () => [
        {
          chunkId: 'chunk-corn-1',
          content:
            'Corn nitrogen deficiency often appears as interveinal chlorosis on lower leaves.',
          similarity: 0.89,
          sourceType: 'UNIVERSITY_EXTENSION',
          sourceTitle: 'ISU Corn Nutrient Deficiency Guide',
          metadata: {
            crops: ['corn'],
            topics: ['nitrogen deficiency'],
            region: 'iowa',
          },
        },
        {
          chunkId: 'chunk-corn-2',
          content:
            'Excess rainfall can increase nitrogen loss and produce yellowing in vegetative corn.',
          similarity: 0.84,
          sourceType: 'GOVERNMENT',
          sourceTitle: 'USDA Corn Nitrogen Advisory',
          metadata: {
            crops: ['corn'],
            topics: ['rainfall', 'nitrogen'],
            region: 'midwest',
          },
        },
      ],
      generateModelOutput: async () => ({
        model: 'claude-sonnet-test',
        output: {
          diagnosis: {
            condition: 'probable_nitrogen_deficiency',
            conditionType: 'deficiency',
            confidence: 0.86,
            reasoning:
              'Lower leaf chlorosis plus rainfall pattern aligns with nitrogen deficiency signals.',
          },
          recommendations: [
            {
              action:
                'Collect tissue and nitrate tests before corrective application.',
              priority: 'immediate',
              timing: 'Within 48 hours',
              details:
                'Sample affected and unaffected zones to verify nutrient imbalance.',
              citations: ['chunk-corn-1', 'chunk-corn-2'],
            },
          ],
          products: [],
          confidence: 0.86,
        },
      }),
      now: () => new Date('2026-02-17T12:00:00.000Z'),
    }
  );

  assert.equal(result.modelUsed, 'claude-sonnet-test');
  assert.equal(result.sources.length, 2);
  assert.equal(
    (result.diagnosis.diagnosis as { condition: string }).condition,
    'probable_nitrogen_deficiency'
  );
  assert.equal(
    (result.diagnosis.diagnosis as { conditionType: string }).conditionType,
    'deficiency'
  );
  assert.ok(
    Array.isArray((result.diagnosis as { recommendations: unknown }).recommendations)
  );
});

test('runRecommendationPipeline falls back to heuristic output without model response', async () => {
  const result = await runRecommendationPipeline(
    {
      inputId: '1fbfd5f1-2099-43c9-a775-c783af74c6f8',
      userId: '11111111-1111-4111-8111-111111111111',
      jobId: 'f0293ad7-4e61-4db7-b25a-3c357c1bfbc5',
    },
    {
      loadInputSnapshot: async () => ({
        type: 'PHOTO',
        crop: 'corn',
        description: 'Interveinal chlorosis observed in lower leaves.',
      }),
      retrieveCandidates: async () => [
        {
          chunkId: 'chunk-corn-3',
          content: 'Corn nutrient deficiency symptoms include leaf yellowing.',
          similarity: 0.8,
          sourceType: 'UNIVERSITY_EXTENSION',
          sourceTitle: 'Corn nutrient reference',
        },
      ],
      generateModelOutput: async () => null,
    }
  );

  assert.equal(result.modelUsed, 'heuristic-rag-v1');
  assert.equal(result.sources[0]?.chunkId, 'chunk-corn-3');
  assert.equal(
    (result.diagnosis.diagnosis as { conditionType: string }).conditionType,
    'deficiency'
  );
});
