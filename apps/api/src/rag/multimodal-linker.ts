import type { RetrievedCandidate } from './types';

export interface ImageCandidate {
  imageId: string;
  caption: string;
  tags: string[];
  position?: number;
}

export interface ImageLinkResult {
  imageId: string;
  linkedChunkId: string | null;
  score: number;
}

function overlapScore(tagsA: string[], tagsB: string[]): number {
  if (tagsA.length === 0 || tagsB.length === 0) {
    return 0;
  }

  const setB = new Set(tagsB.map((tag) => tag.toLowerCase()));
  const matched = tagsA.filter((tag) => setB.has(tag.toLowerCase())).length;
  return matched / Math.max(tagsA.length, tagsB.length);
}

function positionScore(imagePosition: number | undefined, chunkPosition: number | undefined): number {
  if (imagePosition === undefined || chunkPosition === undefined) {
    return 0;
  }

  const delta = Math.abs(imagePosition - chunkPosition);
  return Math.max(0, 1 - delta / 10);
}

export function linkImageCandidatesToText(
  images: ImageCandidate[],
  textCandidates: RetrievedCandidate[]
): ImageLinkResult[] {
  return images.map((image) => {
    let bestChunk: RetrievedCandidate | null = null;
    let bestScore = 0;

    for (const candidate of textCandidates) {
      const candidateTags = candidate.metadata?.tags ?? [];
      const tagScore = overlapScore(image.tags, candidateTags);
      if (tagScore === 0) {
        continue;
      }
      const posScore = positionScore(image.position, candidate.metadata?.position);
      const score = tagScore * 0.7 + posScore * 0.3;

      if (score > bestScore) {
        bestScore = score;
        bestChunk = candidate;
      }
    }

    return {
      imageId: image.imageId,
      linkedChunkId: bestScore > 0 ? bestChunk?.chunkId ?? null : null,
      score: Number(bestScore.toFixed(4)),
    };
  });
}
