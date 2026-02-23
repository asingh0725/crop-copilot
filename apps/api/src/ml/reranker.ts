/**
 * SageMaker Learning-to-Rank reranker.
 *
 * Calls a deployed LightGBM LambdaRank endpoint to re-score retrieval
 * candidates using a model trained on user feedback signals.
 * Falls back gracefully to the original hybrid-ranker order when the
 * endpoint is unconfigured or unavailable.
 *
 * Feature vector (must match FEATURE_COLS in train-ranker.py and export-training-data.ts):
 *   f0: similarity       — vector similarity score (0–1)
 *   f1: rank_score       — hybrid rank score (0–1)
 *   f2: source_authority — encoded source authority float
 *   f3: source_boost     — SourceBoost.boost value stored on candidate
 *   f4: crop_match       — 1 if caller crop ∈ chunk metadata.crops else 0
 *   f5: term_density     — fraction of query terms found in chunk topics
 *   f6: chunk_pos        — normalised chunk position (0–1, capped at position 10)
 *
 * Environment variables:
 *   SAGEMAKER_ENDPOINT_NAME  — endpoint name; leave unset to disable reranking
 *   AWS_REGION               — AWS region (defaults to us-east-1)
 */

import type { RankedCandidate, SourceAuthorityType } from '../rag/types';

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
}

/**
 * Re-rank candidates using the SageMaker LambdaRank endpoint.
 *
 * Returns `null` when:
 * - SAGEMAKER_ENDPOINT_NAME is not set (reranker disabled)
 * - candidates list is empty
 * - the endpoint call fails for any reason
 *
 * The caller must fall back to the original ranked order in all null cases.
 */
export async function rerank(
  candidates: RankedCandidate[],
  context: RerankContext = {},
): Promise<RankedCandidate[] | null> {
  const endpointName = process.env.SAGEMAKER_ENDPOINT_NAME?.trim();
  if (!endpointName || candidates.length === 0) {
    return null;
  }

  const region = process.env.AWS_REGION?.trim() || 'us-east-1';
  const payload = buildCsvPayload(candidates, context);

  try {
    // Dynamic import keeps @aws-sdk/client-sagemaker-runtime out of the
    // cold-start bundle when the reranker is not configured.
    const { SageMakerRuntimeClient, InvokeEndpointCommand } = await import(
      '@aws-sdk/client-sagemaker-runtime'
    );

    const client = new SageMakerRuntimeClient({ region });
    const command = new InvokeEndpointCommand({
      EndpointName: endpointName,
      ContentType: 'text/csv',
      Accept: 'text/csv',
      Body: Buffer.from(payload, 'utf-8'),
    });

    const response = await client.send(command);

    // Body is a Uint8ArrayBlobAdapter in the Node.js SDK runtime
    const responseBody = response.Body
      ? await (response.Body as unknown as { transformToString(): Promise<string> }).transformToString()
      : '';

    const scores = parseScores(responseBody, candidates.length);
    if (!scores) {
      return null;
    }

    return applyScores(candidates, scores);
  } catch (error) {
    console.warn('[reranker] SageMaker call failed — falling back to hybrid ranking', {
      endpoint: endpointName,
      error: (error as Error).message,
    });
    return null;
  }
}

/**
 * Build a CSV payload: one line per candidate with all 7 features.
 * Row order must be preserved; scores come back in the same order.
 */
function buildCsvPayload(candidates: RankedCandidate[], context: RerankContext): string {
  const queryCrop = (context.crop ?? '').toLowerCase().trim();
  const queryTerms = (context.queryTerms ?? []).map((t) => t.toLowerCase());

  return candidates
    .map((candidate) => {
      const f0 = clamp(candidate.similarity, 0, 1).toFixed(6);
      const f1 = clamp(candidate.rankScore, 0, 1).toFixed(6);
      const f2 = (AUTHORITY_SCORES[candidate.sourceType] ?? AUTHORITY_SCORES.OTHER).toFixed(2);
      const f3 = clamp(candidate.sourceBoost ?? 0, -0.1, 0.25).toFixed(4);

      // f4: crop match
      const chunkCrops = (candidate.metadata?.crops ?? []).map((c) => c.toLowerCase());
      const f4 = queryCrop.length > 0 && chunkCrops.includes(queryCrop) ? '1' : '0';

      // f5: term density
      const chunkTopics = (candidate.metadata?.topics ?? []).map((t) => t.toLowerCase());
      const termDensity =
        queryTerms.length > 0
          ? queryTerms.filter(
              (t) => chunkTopics.includes(t) || chunkTopics.some((ct) => ct.includes(t)),
            ).length / queryTerms.length
          : 0;
      const f5 = termDensity.toFixed(4);

      // f6: normalised chunk position
      const f6 = Math.min(1, (candidate.metadata?.position ?? 0) / 10).toFixed(4);

      return `${f0},${f1},${f2},${f3},${f4},${f5},${f6}`;
    })
    .join('\n');
}

/**
 * Parse newline-separated score values returned by the endpoint.
 * Returns null on any parse error so the caller can fall back.
 */
function parseScores(body: string, expectedCount: number): number[] | null {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length !== expectedCount) {
    console.warn('[reranker] score count mismatch', {
      expected: expectedCount,
      received: lines.length,
    });
    return null;
  }

  const scores = lines.map((line) => Number(line));
  if (scores.some((score) => !Number.isFinite(score))) {
    console.warn('[reranker] non-numeric value in endpoint response');
    return null;
  }

  return scores;
}

/**
 * Attach predicted scores to candidates and re-sort descending.
 */
function applyScores(candidates: RankedCandidate[], scores: number[]): RankedCandidate[] {
  return candidates
    .map((candidate, index) => ({
      ...candidate,
      rankScore: scores[index]!,
    }))
    .sort((a, b) => b.rankScore - a.rankScore);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
