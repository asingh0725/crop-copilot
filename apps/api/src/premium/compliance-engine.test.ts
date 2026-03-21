import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCompliance } from './compliance-engine';
import type { PremiumProcessingInput } from './types';

function isoDateDaysFromNow(daysFromNow: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function buildInput(
  overrides: {
    recommendation?: Partial<PremiumProcessingInput['recommendation']>;
    input?: Partial<PremiumProcessingInput['input']>;
    products?: PremiumProcessingInput['products'];
  } = {}
): PremiumProcessingInput {
  return {
    recommendationId: 'rec-1',
    userId: 'user-1',
    recommendation: {
      modelUsed: 'claude-sonnet-test',
      confidence: 0.86,
      diagnosisCondition: 'probable_nutrient_deficiency',
      diagnosisConditionType: 'deficiency',
      sourceSignals: {
        totalSources: 2,
        cropAlignedSources: 2,
        governmentSources: 0,
        policyLikeSources: 0,
      },
      ...(overrides.recommendation ?? {}),
    },
    input: {
      crop: 'blueberries',
      location: 'Iowa, US',
      season: 'Flowering',
      fieldAcreage: 42,
      plannedApplicationDate: isoDateDaysFromNow(7),
      fieldLatitude: 41.8,
      fieldLongitude: -93.6,
      ...(overrides.input ?? {}),
    },
    products: overrides.products ?? [
      {
        productId: 'prod-1',
        productName: 'Test Product',
        productType: 'FUNGICIDE',
        applicationRate: '2.0',
        reason: 'test',
      },
    ],
  };
}

test('evaluateCompliance flags weak recommendation quality as needs manual verification', () => {
  const result = evaluateCompliance(
    buildInput({
      recommendation: {
        modelUsed: 'heuristic-rag-v1',
        confidence: 0.64,
        diagnosisConditionType: 'unknown',
        sourceSignals: {
          totalSources: 2,
          cropAlignedSources: 0,
          governmentSources: 2,
          policyLikeSources: 2,
        },
      },
      input: {
        location: 'British Columbia, CA',
      },
    })
  );

  assert.equal(result.riskReview, 'needs_manual_verification');
  const qualityCheck = result.checks.find((check) => check.id === 'diagnosis_quality');
  assert.ok(qualityCheck);
  assert.equal(qualityCheck?.result, 'needs_manual_verification');
});

test('evaluateCompliance can return clear signal for high-quality advisory context', () => {
  const result = evaluateCompliance(buildInput());
  assert.equal(result.riskReview, 'clear_signal');
});
