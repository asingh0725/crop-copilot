import type { RankedCandidate, RetrievedCandidate, SourceAuthorityType } from './types';

export interface RankContext {
  queryTerms: string[];
  crop?: string;
  region?: string;
  topicHints?: string[];
}

const SOURCE_AUTHORITY_SCORE: Record<SourceAuthorityType, number> = {
  GOVERNMENT: 1,
  UNIVERSITY_EXTENSION: 0.9,
  RESEARCH_PAPER: 0.85,
  MANUFACTURER: 0.6,
  RETAILER: 0.4,
  OTHER: 0.5,
};

const WEIGHTS = {
  vector: 0.55,
  keyword: 0.2,
  authority: 0.15,
  metadata: 0.1,
};

function keywordOverlapScore(content: string, terms: string[]): number {
  if (terms.length === 0) {
    return 0;
  }

  const normalized = content.toLowerCase();
  let matched = 0;

  for (const term of terms) {
    if (normalized.includes(term)) {
      matched += 1;
    }
  }

  return matched / terms.length;
}

function metadataMatchScore(candidate: RetrievedCandidate, context: RankContext): number {
  if (!candidate.metadata) {
    return 0;
  }

  let score = 0;

  const crops = candidate.metadata.crops?.map((crop) => crop.toLowerCase()) ?? [];
  if (context.crop && crops.includes(context.crop.toLowerCase())) {
    score += 0.4;
  }

  const region = candidate.metadata.region?.toLowerCase();
  if (context.region && region && region.includes(context.region.toLowerCase())) {
    score += 0.3;
  }

  const topics = candidate.metadata.topics?.map((topic) => topic.toLowerCase()) ?? [];
  const hints = (context.topicHints ?? []).map((topic) => topic.toLowerCase());
  if (hints.length > 0 && topics.length > 0) {
    const matched = topics.filter((topic) => hints.includes(topic)).length;
    score += Math.min(0.3, matched * 0.15);
  }

  return Math.min(1, score);
}

export function rankCandidates(
  candidates: RetrievedCandidate[],
  context: RankContext
): RankedCandidate[] {
  return candidates
    .map((candidate) => {
      const vector = Math.max(0, Math.min(1, candidate.similarity));
      const keyword = keywordOverlapScore(candidate.content, context.queryTerms);
      const authority = SOURCE_AUTHORITY_SCORE[candidate.sourceType] ?? SOURCE_AUTHORITY_SCORE.OTHER;
      const metadata = metadataMatchScore(candidate, context);

      const rankScore =
        vector * WEIGHTS.vector +
        keyword * WEIGHTS.keyword +
        authority * WEIGHTS.authority +
        metadata * WEIGHTS.metadata;

      return {
        ...candidate,
        rankScore,
        scoreBreakdown: {
          vector,
          keyword,
          authority,
          metadata,
        },
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}
