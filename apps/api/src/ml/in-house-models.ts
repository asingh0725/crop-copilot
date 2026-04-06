export type SupportedModelType = 'lambdarank' | 'premium_quality';

export interface RankingExample {
  qid: string;
  label: number;
  features: number[];
}

export interface InHouseModelMetrics {
  ndcgAt3: number | null;
  ndcgAt5: number | null;
  baselineNdcgAt3: number | null;
  baselineNdcgAt5: number | null;
  pairwiseAccuracy: number | null;
  baselinePairwiseAccuracy: number | null;
}

export interface InHouseLinearModelArtifact {
  backend: 'in_house_linear_v1';
  modelType: SupportedModelType;
  trainedAt: string;
  featureNames: string[];
  featureWeights: number[];
  bias: number;
  scoreRange: {
    min: number;
    max: number;
  };
  sampleCount: number;
  queryCount: number;
  pairCount: number;
  metrics: InHouseModelMetrics;
}

export interface TrainLinearRankingModelParams {
  modelType: SupportedModelType;
  featureNames: string[];
  examples: RankingExample[];
  defaultWeights: number[];
  trainedAt?: string;
}

const LABEL_GAIN = [0, 1, 3];

const DEFAULT_RETRIEVAL_WEIGHTS = normalizeWeights([
  0.3, 0.24, 0.12, 0.11, 0.16, 0.1, -0.08,
]);

const DEFAULT_PREMIUM_WEIGHTS = normalizeWeights([
  0.15, 0.14, 0.2, -0.2, 0.1, 0.12, 0.09,
]);

export function getDefaultModelArtifact(
  modelType: SupportedModelType,
  featureNames: string[],
): InHouseLinearModelArtifact {
  const defaultWeights =
    modelType === 'premium_quality' ? DEFAULT_PREMIUM_WEIGHTS : DEFAULT_RETRIEVAL_WEIGHTS;

  return {
    backend: 'in_house_linear_v1',
    modelType,
    trainedAt: new Date(0).toISOString(),
    featureNames,
    featureWeights: defaultWeights.slice(0, featureNames.length),
    bias: 0,
    scoreRange: {
      min: -1,
      max: 1,
    },
    sampleCount: 0,
    queryCount: 0,
    pairCount: 0,
    metrics: {
      ndcgAt3: null,
      ndcgAt5: null,
      baselineNdcgAt3: null,
      baselineNdcgAt5: null,
      pairwiseAccuracy: null,
      baselinePairwiseAccuracy: null,
    },
  };
}

export function trainLinearRankingModel(
  params: TrainLinearRankingModelParams
): InHouseLinearModelArtifact {
  const { modelType, featureNames, examples, defaultWeights } = params;
  const usableGroups = toUsableGroups(examples);
  const fallbackArtifact = getDefaultModelArtifact(modelType, featureNames);

  if (usableGroups.length === 0) {
    return {
      ...fallbackArtifact,
      trainedAt: params.trainedAt ?? new Date().toISOString(),
      sampleCount: examples.length,
    };
  }

  const learned = computePairwiseWeights(usableGroups, featureNames.length);
  const pairCount = learned.pairCount;
  const blend = clamp(usableGroups.length / 60, 0.35, 0.85);
  const normalizedLearned = normalizeWeights(learned.weights);
  const normalizedDefault = normalizeWeights(defaultWeights);
  const featureWeights = normalizeWeights(
    normalizedLearned.map((value, index) => {
      const base = normalizedDefault[index] ?? 0;
      return value * blend + base * (1 - blend);
    })
  );

  const provisionalArtifact: InHouseLinearModelArtifact = {
    backend: 'in_house_linear_v1',
    modelType,
    trainedAt: params.trainedAt ?? new Date().toISOString(),
    featureNames,
    featureWeights,
    bias: 0,
    scoreRange: {
      min: 0,
      max: 1,
    },
    sampleCount: examples.length,
    queryCount: usableGroups.length,
    pairCount,
    metrics: {
      ndcgAt3: null,
      ndcgAt5: null,
      baselineNdcgAt3: null,
      baselineNdcgAt5: null,
      pairwiseAccuracy: null,
      baselinePairwiseAccuracy: null,
    },
  };

  const scoreRange = computeScoreRange(examples, provisionalArtifact);
  const artifact = {
    ...provisionalArtifact,
    scoreRange,
  };

  const defaultArtifact = {
    ...fallbackArtifact,
    featureNames,
    featureWeights: normalizedDefault.slice(0, featureNames.length),
  };

  return {
    ...artifact,
    metrics: evaluateRankingModel(examples, artifact, defaultArtifact),
  };
}

export function scoreFeatureVector(
  features: number[],
  artifact: InHouseLinearModelArtifact
): number {
  const weights = artifact.featureWeights ?? [];
  let score = artifact.bias ?? 0;
  for (let index = 0; index < Math.min(features.length, weights.length); index += 1) {
    const feature = Number(features[index] ?? 0);
    const weight = Number(weights[index] ?? 0);
    if (!Number.isFinite(feature) || !Number.isFinite(weight)) {
      continue;
    }
    score += feature * weight;
  }
  return score;
}

export function normalizeModelScore(
  score: number,
  artifact: InHouseLinearModelArtifact
): number {
  const min = Number(artifact.scoreRange?.min ?? 0);
  const max = Number(artifact.scoreRange?.max ?? 1);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return clamp(sigmoid(score), 0, 1);
  }
  return clamp((score - min) / (max - min), 0, 1);
}

export function isInHouseModelArtifact(value: unknown): value is InHouseLinearModelArtifact {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.backend === 'in_house_linear_v1' &&
    (candidate.modelType === 'lambdarank' || candidate.modelType === 'premium_quality') &&
    Array.isArray(candidate.featureNames) &&
    Array.isArray(candidate.featureWeights)
  );
}

function toUsableGroups(examples: RankingExample[]): RankingExample[][] {
  const grouped = new Map<string, RankingExample[]>();

  for (const example of examples) {
    if (!grouped.has(example.qid)) {
      grouped.set(example.qid, []);
    }
    grouped.get(example.qid)!.push(example);
  }

  return [...grouped.values()].filter((group) => {
    const labels = new Set(group.map((entry) => entry.label));
    return group.length > 1 && labels.size > 1;
  });
}

function computePairwiseWeights(
  groups: RankingExample[][],
  featureCount: number
): { weights: number[]; pairCount: number } {
  const weights = new Array<number>(featureCount).fill(0);
  let pairCount = 0;

  for (const group of groups) {
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) {
        const a = group[left]!;
        const b = group[right]!;
        if (a.label === b.label) {
          continue;
        }

        const high = a.label > b.label ? a : b;
        const low = a.label > b.label ? b : a;
        const gap = Math.abs(high.label - low.label);
        pairCount += gap;

        for (let featureIndex = 0; featureIndex < featureCount; featureIndex += 1) {
          const highValue = Number(high.features[featureIndex] ?? 0);
          const lowValue = Number(low.features[featureIndex] ?? 0);
          weights[featureIndex] += (highValue - lowValue) * gap;
        }
      }
    }
  }

  if (pairCount === 0) {
    return {
      weights,
      pairCount,
    };
  }

  return {
    weights: weights.map((value) => value / pairCount),
    pairCount,
  };
}

function evaluateRankingModel(
  examples: RankingExample[],
  artifact: InHouseLinearModelArtifact,
  baseline: InHouseLinearModelArtifact
): InHouseModelMetrics {
  const groups = toUsableGroups(examples);
  if (groups.length === 0) {
    return {
      ndcgAt3: null,
      ndcgAt5: null,
      baselineNdcgAt3: null,
      baselineNdcgAt5: null,
      pairwiseAccuracy: null,
      baselinePairwiseAccuracy: null,
    };
  }

  const ndcgAt3 = average(groups.map((group) => ndcgForGroup(group, artifact, 3)));
  const ndcgAt5 = average(groups.map((group) => ndcgForGroup(group, artifact, 5)));
  const baselineNdcgAt3 = average(groups.map((group) => ndcgForGroup(group, baseline, 3)));
  const baselineNdcgAt5 = average(groups.map((group) => ndcgForGroup(group, baseline, 5)));

  return {
    ndcgAt3,
    ndcgAt5,
    baselineNdcgAt3,
    baselineNdcgAt5,
    pairwiseAccuracy: pairwiseAccuracy(groups, artifact),
    baselinePairwiseAccuracy: pairwiseAccuracy(groups, baseline),
  };
}

function pairwiseAccuracy(
  groups: RankingExample[][],
  artifact: InHouseLinearModelArtifact
): number | null {
  let correct = 0;
  let total = 0;

  for (const group of groups) {
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) {
        const a = group[left]!;
        const b = group[right]!;
        if (a.label === b.label) {
          continue;
        }
        total += 1;
        const aScore = scoreFeatureVector(a.features, artifact);
        const bScore = scoreFeatureVector(b.features, artifact);
        if ((a.label > b.label && aScore >= bScore) || (b.label > a.label && bScore >= aScore)) {
          correct += 1;
        }
      }
    }
  }

  return total > 0 ? correct / total : null;
}

function ndcgForGroup(
  group: RankingExample[],
  artifact: InHouseLinearModelArtifact,
  k: number
): number {
  const ranked = [...group].sort(
    (left, right) => scoreFeatureVector(right.features, artifact) - scoreFeatureVector(left.features, artifact)
  );
  const ideal = [...group].sort((left, right) => right.label - left.label);
  const actualDcg = dcg(ranked.slice(0, k).map((entry) => entry.label));
  const idealDcg = dcg(ideal.slice(0, k).map((entry) => entry.label));
  if (idealDcg <= 0) {
    return 0;
  }
  return actualDcg / idealDcg;
}

function dcg(labels: number[]): number {
  return labels.reduce((sum, label, index) => {
    const gain = LABEL_GAIN[label] ?? 0;
    return sum + gain / Math.log2(index + 2);
  }, 0);
}

function computeScoreRange(
  examples: RankingExample[],
  artifact: InHouseLinearModelArtifact
): { min: number; max: number } {
  if (examples.length === 0) {
    return { min: -1, max: 1 };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const example of examples) {
    const score = scoreFeatureVector(example.features, artifact);
    if (score < min) {
      min = score;
    }
    if (score > max) {
      max = score;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { min: min - 1 || -1, max: max + 1 || 1 };
  }

  return { min, max };
}

function normalizeWeights(weights: number[]): number[] {
  const magnitude = weights.reduce((sum, value) => sum + Math.abs(value), 0);
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    return weights.map(() => 0);
  }
  return weights.map((value) => Number((value / magnitude).toFixed(6)));
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
