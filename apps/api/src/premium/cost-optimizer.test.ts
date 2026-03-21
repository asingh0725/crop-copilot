import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCostAnalysis } from './cost-optimizer';
import type { PremiumProcessingInput } from './types';

const baseInput: PremiumProcessingInput = {
  recommendationId: 'rec-1',
  userId: 'user-1',
  recommendation: {
    modelUsed: 'claude-sonnet-test',
    confidence: 0.84,
    diagnosisCondition: 'probable_deficiency',
    diagnosisConditionType: 'deficiency',
    sourceSignals: {
      totalSources: 2,
      cropAlignedSources: 2,
      governmentSources: 0,
      policyLikeSources: 0,
    },
  },
  input: {
    crop: 'corn',
    location: 'Iowa, US',
    season: 'Vegetative',
    fieldAcreage: 100,
    plannedApplicationDate: '2026-03-10',
    fieldLatitude: 41.8,
    fieldLongitude: -93.6,
  },
  products: [
    {
      productId: 'prod-1',
      productName: 'Prod 1',
      productType: 'FERTILIZER',
      applicationRate: '2.0',
      reason: 'test',
    },
  ],
};

test('buildCostAnalysis keeps totals null when pricing is unavailable', () => {
  const result = buildCostAnalysis(baseInput, [
    { productId: 'prod-1', retailPriceUsd: null, priceSource: null },
  ]);
  assert.ok(result);
  assert.equal(result?.perAcreTotalUsd, null);
  assert.equal(result?.wholeFieldTotalUsd, null);
  assert.equal(result?.pricedItemCount, 0);
  assert.equal(result?.totalItemCount, 1);
  assert.equal(result?.pricingCoverageRatio, 0);
});

test('buildCostAnalysis calculates totals when pricing is available', () => {
  const result = buildCostAnalysis(baseInput, [
    { productId: 'prod-1', retailPriceUsd: 12.5, priceSource: 'live' },
  ]);
  assert.ok(result);
  assert.equal(result?.perAcreTotalUsd, 25);
  assert.equal(result?.wholeFieldTotalUsd, 2500);
  assert.equal(result?.pricedItemCount, 1);
  assert.equal(result?.totalItemCount, 1);
  assert.equal(result?.pricingCoverageRatio, 1);
});
