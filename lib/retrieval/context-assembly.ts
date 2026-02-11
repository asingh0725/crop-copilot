import { prisma } from "@/lib/prisma";
import type { SearchResult } from "./search";

export interface RetrievedChunk {
  id: string;
  content: string;
  similarity: number;
  rankScore?: number;
  source: {
    id: string;
    title: string;
    sourceType: string;
    institution?: string | null;
  };
}

export interface AssembledContext {
  chunks: RetrievedChunk[];
  totalChunks: number;
  totalTokens: number;
  relevanceThreshold: number;
  requiredButExcluded?: string[];
}

const BASE_RELEVANCE_THRESHOLD = 0.5;
const MIN_RELEVANCE_THRESHOLD = 0.35;
const MIN_CONTEXT_CHUNKS = 4;
const MAX_TOKENS = 4000;
const CHARS_PER_TOKEN = 3;
const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN;
const MAX_CHUNKS_PER_SOURCE = 2;
const MAX_CHARS_PER_CHUNK = 1200;

const SOURCE_TYPE_PRIORITY: Record<string, number> = {
  GOVERNMENT: 4,
  UNIVERSITY_EXTENSION: 3,
  RESEARCH_PAPER: 2,
  MANUFACTURER: 1,
  RETAILER: 0,
};

/**
 * Assemble retrieved chunks into structured context for LLM consumption
 */
export async function assembleContext(
  textResults: SearchResult[],
  imageResults: SearchResult[],
  options: { requiredSourceIds?: string[] } = {}
): Promise<AssembledContext> {
  // Combine and deduplicate by ID
  const allResults = [...textResults, ...imageResults];
  const uniqueResults = deduplicateById(allResults);

  // Filter by dynamic relevance threshold to avoid empty contexts
  const { threshold, relevantResults } = applyDynamicThreshold(uniqueResults);
  const requiredSourceIds = new Set(options.requiredSourceIds || []);
  // Always include chunks from required sources regardless of similarity threshold
  const requiredResults =
    requiredSourceIds.size === 0
      ? []
      : uniqueResults.filter((result) => requiredSourceIds.has(result.sourceId));
  const mergedResults = deduplicateById([...relevantResults, ...requiredResults]);

  // Fetch source metadata
  const chunks = await enrichWithSourceMetadata(mergedResults);

  // Prefer higher authority source types while preserving relevance
  chunks.sort((a, b) => {
    const relevanceA = a.rankScore ?? a.similarity;
    const relevanceB = b.rankScore ?? b.similarity;
    const authorityA = (SOURCE_TYPE_PRIORITY[a.source.sourceType] ?? 0) / 4;
    const authorityB = (SOURCE_TYPE_PRIORITY[b.source.sourceType] ?? 0) / 4;
    const scoreA = relevanceA * 0.8 + authorityA * 0.2;
    const scoreB = relevanceB * 0.8 + authorityB * 0.2;

    return scoreB - scoreA;
  });

  const sourceBalancedChunks = enforceSourceDiversity(
    chunks,
    chunks.length <= 6 ? MAX_CHUNKS_PER_SOURCE + 1 : MAX_CHUNKS_PER_SOURCE,
    requiredSourceIds
  );

  // Truncate to fit within token limit
  const truncatedChunks = truncateToFit(sourceBalancedChunks, MAX_CHARS);

  // Track required sources that ended up excluded after truncation
  const includedSourceIds = new Set(truncatedChunks.map((c) => c.source.id));
  const requiredButExcluded = Array.from(requiredSourceIds).filter(
    (id) => !includedSourceIds.has(id)
  );

  const totalTokens = Math.ceil(
    truncatedChunks.reduce((sum, c) => sum + c.content.length, 0) /
      CHARS_PER_TOKEN
  );

  return {
    chunks: truncatedChunks,
    totalChunks: truncatedChunks.length,
    totalTokens,
    relevanceThreshold: threshold,
    requiredButExcluded: requiredButExcluded.length > 0 ? requiredButExcluded : undefined,
  };
}

function enforceSourceDiversity(
  chunks: RetrievedChunk[],
  maxPerSource: number,
  requiredSourceIds: Set<string> = new Set()
): RetrievedChunk[] {
  const sourceCounts = new Map<string, number>();
  const balanced: RetrievedChunk[] = [];

  for (const chunk of chunks) {
    const count = sourceCounts.get(chunk.source.id) || 0;
    // Exempt required sources from per-source cap
    if (count >= maxPerSource && !requiredSourceIds.has(chunk.source.id)) {
      continue;
    }

    sourceCounts.set(chunk.source.id, count + 1);
    balanced.push(chunk);
  }

  return balanced;
}

/**
 * Remove duplicate chunks by ID
 */
function deduplicateById(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

/**
 * Enrich chunks with source metadata from database
 */
async function enrichWithSourceMetadata(
  results: SearchResult[]
): Promise<RetrievedChunk[]> {
  const sourceIds = Array.from(new Set(results.map((r) => r.sourceId)));

  const sources = await prisma.source.findMany({
    where: { id: { in: sourceIds } },
    select: {
      id: true,
      title: true,
      sourceType: true,
      institution: true,
    },
  });

  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  return results.map((r) => ({
    id: r.id,
    content: r.content,
    similarity: r.similarity,
    rankScore: r.rankScore,
    source: sourceMap.get(r.sourceId)!,
  }));
}

/**
 * Truncate chunks to fit within character limit
 */
function truncateToFit(
  chunks: RetrievedChunk[],
  maxChars: number
): RetrievedChunk[] {
  let currentChars = 0;
  const result: RetrievedChunk[] = [];

  for (const chunk of chunks) {
    const normalizedContent =
      chunk.content.length > MAX_CHARS_PER_CHUNK
        ? chunk.content.slice(0, MAX_CHARS_PER_CHUNK - 3) + "..."
        : chunk.content;
    const chunkLength = normalizedContent.length;

    if (currentChars + chunkLength <= maxChars) {
      result.push(chunk);
      result[result.length - 1].content = normalizedContent;
      currentChars += chunkLength;
    } else {
      // Try to fit a truncated version
      const remainingChars = maxChars - currentChars;
      if (remainingChars > 200) {
        // Only include if we can fit at least 200 chars
        result.push({
          ...chunk,
          content: normalizedContent.slice(0, remainingChars - 3) + "...",
        });
      }
      break;
    }
  }

  return result;
}

function applyDynamicThreshold(results: SearchResult[]): {
  threshold: number;
  relevantResults: SearchResult[];
} {
  let threshold = BASE_RELEVANCE_THRESHOLD;
  let relevantResults = results.filter((r) => r.similarity >= threshold);

  if (relevantResults.length >= MIN_CONTEXT_CHUNKS) {
    return { threshold, relevantResults };
  }

  threshold = Math.max(MIN_RELEVANCE_THRESHOLD, BASE_RELEVANCE_THRESHOLD - 0.1);
  relevantResults = results.filter((r) => r.similarity >= threshold);

  if (relevantResults.length >= MIN_CONTEXT_CHUNKS) {
    return { threshold, relevantResults };
  }

  threshold = MIN_RELEVANCE_THRESHOLD;
  relevantResults = results.filter((r) => r.similarity >= threshold);

  return { threshold, relevantResults };
}
