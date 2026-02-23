/**
 * Maximal Marginal Relevance (MMR)
 *
 * Post-retrieval diversification: selects candidates that are both
 * relevant to the query AND diverse from each other.
 *
 * Without MMR, the top-K candidates from a dense retriever are often
 * near-duplicates (e.g. 4 chunks all saying "nitrogen deficiency causes
 * yellowing"). MMR ensures the context window sent to Claude covers
 * different aspects of the problem.
 *
 * Formula:
 *   score(c) = λ · relevance(c) - (1 - λ) · max_sim(c, already_selected)
 *
 * λ = 0   → maximum diversity
 * λ = 1   → maximum relevance (equivalent to no MMR)
 * λ = 0.6 → balanced default (recommended)
 *
 * Similarity is computed with Jaccard on 4+ char word tokens — fast and
 * sufficient without needing stored embeddings.
 */

import type { RankedCandidate } from './types';

/**
 * Reorder `candidates` (already sorted by relevance) so that the first
 * `topK` items maximise relevance while minimising redundancy.
 */
export function applyMMR(
  candidates: RankedCandidate[],
  topK: number,
  lambda = 0.6,
): RankedCandidate[] {
  if (candidates.length <= topK) return candidates;

  const selected: RankedCandidate[] = [];
  const remaining = [...candidates];

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      const relevance = candidate.rankScore;

      const maxSimilarityToSelected =
        selected.length === 0
          ? 0
          : Math.max(...selected.map((s) => jaccardSimilarity(candidate.content, s.content)));

      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarityToSelected;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining[bestIdx]!);
    remaining.splice(bestIdx, 1);
  }

  return selected;
}

/**
 * Jaccard similarity on 4+-character word token sets.
 * Runs in O(|A| + |B|) after tokenisation.
 */
function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  return intersection / (setA.size + setB.size - intersection);
}

function tokenSet(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
  return new Set(tokens);
}
