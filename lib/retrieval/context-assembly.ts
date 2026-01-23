import { prisma } from "@/lib/prisma";
import type { SearchResult } from "./search";

export interface RetrievedChunk {
  id: string;
  content: string;
  similarity: number;
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
}

const RELEVANCE_THRESHOLD = 0.5;
const MAX_TOKENS = 4000;
const CHARS_PER_TOKEN = 3;
const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN;

/**
 * Assemble retrieved chunks into structured context for LLM consumption
 */
export async function assembleContext(
  textResults: SearchResult[],
  imageResults: SearchResult[]
): Promise<AssembledContext> {
  // Combine and deduplicate by ID
  const allResults = [...textResults, ...imageResults];
  const uniqueResults = deduplicateById(allResults);

  // Filter by relevance threshold
  const relevantResults = uniqueResults.filter(
    (r) => r.similarity >= RELEVANCE_THRESHOLD
  );

  // Sort by relevance (highest first)
  relevantResults.sort((a, b) => b.similarity - a.similarity);

  // Fetch source metadata
  const chunks = await enrichWithSourceMetadata(relevantResults);

  // Truncate to fit within token limit
  const truncatedChunks = truncateToFit(chunks, MAX_CHARS);

  const totalTokens = Math.ceil(
    truncatedChunks.reduce((sum, c) => sum + c.content.length, 0) /
      CHARS_PER_TOKEN
  );

  return {
    chunks: truncatedChunks,
    totalChunks: truncatedChunks.length,
    totalTokens,
    relevanceThreshold: RELEVANCE_THRESHOLD,
  };
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
    const chunkLength = chunk.content.length;

    if (currentChars + chunkLength <= maxChars) {
      result.push(chunk);
      currentChars += chunkLength;
    } else {
      // Try to fit a truncated version
      const remainingChars = maxChars - currentChars;
      if (remainingChars > 200) {
        // Only include if we can fit at least 200 chars
        result.push({
          ...chunk,
          content: chunk.content.slice(0, remainingChars - 3) + "...",
        });
      }
      break;
    }
  }

  return result;
}
