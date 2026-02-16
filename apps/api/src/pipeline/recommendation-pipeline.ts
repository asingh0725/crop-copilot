import { randomUUID } from 'node:crypto';
import type { RecommendationResult } from '@crop-copilot/contracts';
import { rankCandidates } from '../rag/hybrid-ranker';
import { expandRetrievalQuery } from '../rag/query-expansion';
import { linkImageCandidatesToText } from '../rag/multimodal-linker';
import { chunkTextSemantically } from '../rag/semantic-chunker-v2';
import type { RetrievedCandidate } from '../rag/types';

export interface RecommendationPipelineInput {
  inputId: string;
  userId: string;
  jobId: string;
}

/**
 * Placeholder recommendation pipeline for async orchestration.
 * Future phases will replace this with real retrieval, generation, and validation stages.
 */
export async function runRecommendationPipeline(
  input: RecommendationPipelineInput
): Promise<RecommendationResult> {
  const now = new Date().toISOString();
  const retrieval = buildMockRetrievedCandidates(input);
  const expansion = expandRetrievalQuery({
    query: `crop diagnosis for input ${input.inputId}`,
    crop: 'tomato',
    region: 'california',
    growthStage: 'flowering',
  });

  const ranked = rankCandidates(retrieval, {
    queryTerms: expansion.terms,
    crop: 'tomato',
    region: 'california',
    topicHints: ['blight', 'disease management'],
  });

  const topCandidates = ranked.slice(0, 2);
  const imageLinks = linkImageCandidatesToText(
    [
      {
        imageId: 'img-diagnostic-1',
        caption: 'leaf lesions and haloing',
        tags: ['tomato', 'lesion', 'blight'],
        position: 2,
      },
    ],
    topCandidates
  );

  const evidenceChunks = chunkTextSemantically(
    'Evidence Summary',
    topCandidates.map((candidate) => candidate.content).join('\n\n')
  ).slice(0, 1);

  return {
    recommendationId: randomUUID(),
    confidence: 0.78,
    diagnosis: {
      condition: 'probable_foliar_disease',
      summary: `Ranked ${ranked.length} candidates with hybrid scoring and selected ${topCandidates.length} primary evidence chunks.`,
      generatedAt: now,
      inputId: input.inputId,
      userId: input.userId,
      jobId: input.jobId,
      linkedImages: imageLinks,
      evidencePreview: evidenceChunks.map((chunk) => chunk.content.slice(0, 200)),
    },
    sources: topCandidates.map((candidate) => ({
      chunkId: candidate.chunkId,
      relevance: Number(candidate.rankScore.toFixed(4)),
      excerpt: candidate.content.slice(0, 300),
    })),
    modelUsed: 'rag-v2-scaffold',
  };
}

function buildMockRetrievedCandidates(input: RecommendationPipelineInput): RetrievedCandidate[] {
  return [
    {
      chunkId: `${input.inputId}-ext-1`,
      content:
        'University extension guidance indicates early fungicide action when tomato foliage shows expanding water-soaked lesions and haloing.',
      similarity: 0.82,
      sourceType: 'UNIVERSITY_EXTENSION',
      sourceTitle: 'UC Extension Tomato Disease Guide',
      metadata: {
        crops: ['tomato'],
        region: 'california',
        topics: ['blight', 'disease management'],
        tags: ['tomato', 'lesion', 'blight'],
        position: 3,
      },
    },
    {
      chunkId: `${input.inputId}-gov-1`,
      content:
        'Government advisory recommends scouting intervals of 48-72 hours during wet periods and validating fungicide resistance before application.',
      similarity: 0.79,
      sourceType: 'GOVERNMENT',
      sourceTitle: 'State Crop Advisory Bulletin',
      metadata: {
        crops: ['tomato'],
        region: 'california',
        topics: ['scouting', 'management'],
        tags: ['tomato', 'scouting'],
        position: 5,
      },
    },
    {
      chunkId: `${input.inputId}-retailer-1`,
      content: 'Retail content discussing broad fungicide options with less crop-specific timing guidance.',
      similarity: 0.83,
      sourceType: 'RETAILER',
      sourceTitle: 'Retailer Blog',
      metadata: {
        crops: ['tomato'],
        region: 'global',
        topics: ['products'],
        tags: ['fungicide'],
        position: 12,
      },
    },
  ];
}
