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

test('runRecommendationPipeline filters cross-crop evidence before model generation', async () => {
  const result = await runRecommendationPipeline(
    {
      inputId: '8e3d0d0d-42f4-4097-8a57-e7f3625e7d22',
      userId: '11111111-1111-4111-8111-111111111111',
      jobId: 'f0f45ded-4dca-470a-b7d2-f04de47f7da2',
    },
    {
      loadInputSnapshot: async () => ({
        type: 'PHOTO',
        crop: 'blueberries',
        location: 'British Columbia, CA',
        description:
          'Newer leaves are yellowing while veins remain green after sustained rain.',
      }),
      retrieveCandidates: async () => [
        {
          chunkId: 'chunk-grape-1',
          content:
            'Guide to pest control products registered for use on grapes in British Columbia.',
          similarity: 0.89,
          sourceType: 'GOVERNMENT',
          sourceTitle:
            'Guide to pest control products registered for use on grapes in British Columbia',
          metadata: { crops: ['grapes'] },
        },
        {
          chunkId: 'chunk-blueberry-1',
          content:
            'Blueberry chlorosis can appear on newer leaves while veins stay green in saturated soils.',
          similarity: 0.84,
          sourceType: 'UNIVERSITY_EXTENSION',
          sourceTitle: 'Blueberry nutrient stress guide',
          metadata: { crops: ['blueberries'] },
        },
      ],
      generateModelOutput: async ({ candidates }) => ({
        model: 'claude-sonnet-test',
        output: {
          diagnosis: {
            condition: 'probable_nutrient_deficiency',
            conditionType: 'deficiency',
            confidence: 0.79,
            reasoning: 'Symptoms and crop-specific evidence suggest nutrient stress.',
          },
          recommendations: [
            {
              action: 'Collect tissue samples from symptomatic and healthy rows.',
              priority: 'immediate',
              timing: 'Within 48 hours',
              details: 'Validate nutrient imbalance before corrective treatment.',
              citations: candidates.map((candidate) => candidate.chunkId),
            },
          ],
          products: [],
          confidence: 0.79,
        },
      }),
    }
  );

  assert.equal(result.modelUsed, 'claude-sonnet-test');
  assert.equal(result.sources[0]?.chunkId, 'chunk-blueberry-1');
  assert.equal(result.sources.some((source) => source.chunkId === 'chunk-grape-1'), false);
  assert.equal(
    (result.diagnosis.diagnosis as { conditionType: string }).conditionType,
    'deficiency'
  );
});

test('runRecommendationPipeline fails when model output is unavailable', async () => {
  await assert.rejects(
    () =>
      runRecommendationPipeline(
        {
          inputId: '8e3d0d0d-42f4-4097-8a57-e7f3625e7d23',
          userId: '11111111-1111-4111-8111-111111111111',
          jobId: 'f0f45ded-4dca-470a-b7d2-f04de47f7da3',
        },
        {
          loadInputSnapshot: async () => ({
            type: 'PHOTO',
            crop: 'potatoes',
            description: 'Lower leaves yellowing and edge scorching.',
          }),
          retrieveCandidates: async () => [],
          generateModelOutput: async () => null,
        }
      ),
    /Model output unavailable/
  );
});
