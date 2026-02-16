/**
 * Retrieval Service
 *
 * Handles knowledge base vector search operations.
 * Extracted from /api/retrieval/search route.
 */

import { searchTextChunks, searchImageChunks, SearchResult } from '@/lib/retrieval/search';
import { z } from 'zod';

export const searchSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  type: z.enum(['text', 'image', 'both']).default('both'),
  limit: z.number().min(1).max(20).default(5),
});

export type SearchInput = z.infer<typeof searchSchema>;

export interface SearchParams {
  query: string;
  type?: 'text' | 'image' | 'both';
  limit?: number;
}

export interface SearchResultsResponse {
  query: string;
  type: 'text' | 'image' | 'both';
  textResults: SearchResult[];
  imageResults: SearchResult[];
  totalResults: number;
}

/**
 * Search the knowledge base using vector similarity
 */
export async function searchKnowledgeBase(
  params: SearchParams
): Promise<SearchResultsResponse> {
  // Validate input
  const validated = searchSchema.parse(params);
  const { query, type, limit } = validated;

  let textResults: SearchResult[] = [];
  let imageResults: SearchResult[] = [];

  if (type === 'text' || type === 'both') {
    textResults = await searchTextChunks(query, limit);
  }

  if (type === 'image' || type === 'both') {
    imageResults = await searchImageChunks(query, limit);
  }

  return {
    query,
    type,
    textResults,
    imageResults,
    totalResults: textResults.length + imageResults.length,
  };
}
