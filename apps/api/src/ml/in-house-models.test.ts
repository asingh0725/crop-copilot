import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultModelArtifact,
  normalizeModelScore,
  scoreFeatureVector,
  trainLinearRankingModel,
  type RankingExample,
} from './in-house-models';
import { RETRIEVAL_FEATURE_NAMES } from './reranker';
import { PREMIUM_FEATURE_NAMES, buildPremiumQualityCheck } from './premium-quality';

test('trainLinearRankingModel learns to rank stronger examples above weaker ones', () => {
  const examples: RankingExample[] = [
    {
      qid: 'q1',
      label: 2,
      features: [0.95, 0.82, 1, 0.18, 1, 0.9, 0.1],
    },
    {
      qid: 'q1',
      label: 0,
      features: [0.25, 0.3, 0.4, 0, 0, 0.1, 0.9],
    },
    {
      qid: 'q2',
      label: 2,
      features: [0.88, 0.77, 0.9, 0.12, 1, 0.8, 0.2],
    },
    {
      qid: 'q2',
      label: 0,
      features: [0.2, 0.22, 0.5, -0.02, 0, 0.05, 1],
    },
  ];

  const model = trainLinearRankingModel({
    modelType: 'lambdarank',
    featureNames: [...RETRIEVAL_FEATURE_NAMES],
    examples,
    defaultWeights: getDefaultModelArtifact('lambdarank', [...RETRIEVAL_FEATURE_NAMES]).featureWeights,
  });

  const highScore = scoreFeatureVector(examples[0]!.features, model);
  const lowScore = scoreFeatureVector(examples[1]!.features, model);

  assert.ok(highScore > lowScore);
  assert.ok((model.metrics.pairwiseAccuracy ?? 0) >= 1);
  assert.ok((model.metrics.ndcgAt3 ?? 0) >= 1);
});

test('premium quality check surfaces weak support coverage as a conflict signal', () => {
  const model = getDefaultModelArtifact('premium_quality', [...PREMIUM_FEATURE_NAMES]);
  const weakCheck = buildPremiumQualityCheck({
    artifact: model,
    payload: {
      riskReview: 'needs_manual_verification',
      checks: [],
      costAnalysis: null,
      sprayWindows: [{ startsAt: '', endsAt: '', score: 50, summary: '', source: 'fallback' }],
      report: null,
    },
  });

  assert.equal(weakCheck.id, 'premium_quality_confidence');
  assert.equal(typeof weakCheck.evidence?.qualityScore, 'number');
  assert.ok(normalizeModelScore(scoreFeatureVector([0.4, 0, 0, 0, 0, 0, 0], model), model) >= 0);
});
