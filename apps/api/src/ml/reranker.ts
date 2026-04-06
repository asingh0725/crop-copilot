/**
 * In-house retrieval reranker.
 *
 * Scores retrieval candidates with a locally computed linear model trained
 * from feedback data. Falls back to the default weight set when no deployed
 * artifact exists.
 *
 * Feature vector (must match training export/build logic):
 *   f0: similarity       — vector similarity score (0–1)
 *   f1: rank_score       — hybrid rank score (0–1)
 *   f2: source_authority — encoded source authority float
 *   f3: source_boost     — SourceBoost.boost value stored on candidate
 *   f4: crop_match       — 1 if caller crop ∈ chunk metadata.crops else 0
 *   f5: term_density     — fraction of query terms found in chunk topics
 *   f6: chunk_pos        — normalised chunk position (0–1, capped at position 10)
 */

import type { RankedCandidate, SourceAuthorityType } from '../rag/types';
import {
  getDefaultModelArtifact,
  scoreFeatureVector,
  type InHouseLinearModelArtifact,
} from './in-house-models';

const AUTHORITY_SCORES: Record<SourceAuthorityType, number> = {
  GOVERNMENT: 1.0,
  UNIVERSITY_EXTENSION: 0.9,
  RESEARCH_PAPER: 0.85,
  MANUFACTURER: 0.6,
  RETAILER: 0.4,
  OTHER: 0.5,
};

export interface RerankContext {
  crop?: string;
  queryTerms?: string[];
  model?: InHouseLinearModelArtifact | null;
}

export const RETRIEVAL_FEATURE_NAMES = [
  'f0_similarity',
  'f1_rank_score',
  'f2_authority',
  'f3_source_boost',
  'f4_crop_match',
  'f5_term_density',
  'f6_chunk_pos',
] as const;

/**
 * Re-rank candidates using the deployed in-house artifact, or the default
 * fallback model when no artifact is available.
 */
export async function rerank(
  candidates: RankedCandidate[],
  context: RerankContext = {},
): Promise<RankedCandidate[] | null> {
  if (process.env.DISABLE_RERANKER === '1') {
    return null;
  }

  if (candidates.length === 0) {
    return null;
  }

  const model =
    context.model ?? getDefaultModelArtifact('lambdarank', [...RETRIEVAL_FEATURE_NAMES]);
  const scored = candidates.map((candidate) => ({
    candidate,
    score: scoreFeatureVector(buildFeatureVector(candidate, context), model),
  }));

  return scored
    .sort((left, right) => right.score - left.score)
    .map(({ candidate, score }) => ({
      ...candidate,
      rankScore: score,
    }));
}

/**
 * Build the 7-feature vector for training/runtime scoring.
 */
export function buildFeatureVector(
  candidate: RankedCandidate,
  context: Pick<RerankContext, 'crop' | 'queryTerms'>
): number[] {
  const queryCrop = (context.crop ?? '').toLowerCase().trim();
  const queryTerms = (context.queryTerms ?? []).map((t) => t.toLowerCase());
  const f0 = clamp(candidate.similarity, 0, 1);
  const f1 = clamp(candidate.rankScore, 0, 1);
  const f2 = AUTHORITY_SCORES[candidate.sourceType] ?? AUTHORITY_SCORES.OTHER;
  const f3 = clamp(candidate.sourceBoost ?? 0, -0.1, 0.25);

  const chunkCrops = (candidate.metadata?.crops ?? []).map((crop) => crop.toLowerCase());
  const f4 = queryCrop.length > 0 && chunkCrops.includes(queryCrop) ? 1 : 0;

  const chunkTopics = (candidate.metadata?.topics ?? []).map((topic) => topic.toLowerCase());
  const f5 =
    queryTerms.length > 0
      ? queryTerms.filter(
          (term) => chunkTopics.includes(term) || chunkTopics.some((topic) => topic.includes(term)),
        ).length / queryTerms.length
      : 0;

  const f6 = Math.min(1, (candidate.metadata?.position ?? 0) / 10);
  return [f0, f1, f2, f3, f4, f5, f6];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
