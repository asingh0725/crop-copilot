import { prisma } from "@/lib/prisma";

/**
 * Search result for text chunks
 */
export interface TextChunkSearchResult {
  id: string;
  sourceId: string;
  content: string;
  metadata: any;
  distance: number;
  similarity: number;
  source: {
    id: string;
    title: string;
    url: string | null;
    sourceType: string;
    institution: string | null;
  };
}

/**
 * Search result for image chunks
 */
export interface ImageChunkSearchResult {
  id: string;
  sourceId: string;
  imageUrl: string;
  caption: string | null;
  metadata: any;
  distance: number;
  similarity: number;
  source: {
    id: string;
    title: string;
    url: string | null;
    sourceType: string;
    institution: string | null;
  };
}

/**
 * Search for text chunks similar to the query embedding using cosine distance
 *
 * @param queryEmbedding - The embedding vector to search for (1536 dimensions)
 * @param limit - Maximum number of results to return (default: 5)
 * @param threshold - Minimum similarity score threshold (0-1, default: 0.7)
 * @returns Array of text chunks ordered by similarity (highest first)
 */
export async function searchSimilarTextChunks(
  queryEmbedding: number[],
  limit: number = 5,
  threshold: number = 0.7
): Promise<TextChunkSearchResult[]> {
  if (queryEmbedding.length !== 1536) {
    throw new Error("Text embedding must have 1536 dimensions");
  }

  if (threshold < 0 || threshold > 1) {
    throw new Error("Threshold must be between 0 and 1");
  }

  // Convert embedding array to pgvector format
  const embeddingString = `[${queryEmbedding.join(",")}]`;

  // Use raw SQL for vector similarity search
  // The <=> operator computes cosine distance (0 = identical, 2 = opposite)
  // We convert to similarity score: similarity = 1 - (distance / 2)
  const results = await prisma.$queryRaw<
    Array<{
      id: string;
      source_id: string;
      content: string;
      metadata: any;
      distance: number;
      source_title: string;
      source_url: string | null;
      source_type: string;
      source_institution: string | null;
    }>
  >`
    SELECT
      tc.id,
      tc.source_id,
      tc.content,
      tc.metadata,
      tc.embedding <=> ${embeddingString}::vector AS distance,
      s.title AS source_title,
      s.url AS source_url,
      s.source_type,
      s.institution AS source_institution
    FROM "TextChunk" tc
    JOIN "Source" s ON s.id = tc.source_id
    WHERE tc.embedding IS NOT NULL
      AND (1 - (tc.embedding <=> ${embeddingString}::vector) / 2) >= ${threshold}
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  // Transform results to match interface
  return results.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    content: row.content,
    metadata: row.metadata,
    distance: row.distance,
    similarity: 1 - row.distance / 2, // Convert distance to similarity score
    source: {
      id: row.source_id,
      title: row.source_title,
      url: row.source_url,
      sourceType: row.source_type,
      institution: row.source_institution,
    },
  }));
}

/**
 * Search for image chunks similar to the query embedding using cosine distance
 *
 * @param queryEmbedding - The embedding vector to search for (512 dimensions)
 * @param limit - Maximum number of results to return (default: 5)
 * @param threshold - Minimum similarity score threshold (0-1, default: 0.7)
 * @returns Array of image chunks ordered by similarity (highest first)
 */
export async function searchSimilarImages(
  queryEmbedding: number[],
  limit: number = 5,
  threshold: number = 0.7
): Promise<ImageChunkSearchResult[]> {
  if (queryEmbedding.length !== 512) {
    throw new Error("Image embedding must have 512 dimensions");
  }

  if (threshold < 0 || threshold > 1) {
    throw new Error("Threshold must be between 0 and 1");
  }

  // Convert embedding array to pgvector format
  const embeddingString = `[${queryEmbedding.join(",")}]`;

  // Use raw SQL for vector similarity search
  const results = await prisma.$queryRaw<
    Array<{
      id: string;
      source_id: string;
      image_url: string;
      caption: string | null;
      metadata: any;
      distance: number;
      source_title: string;
      source_url: string | null;
      source_type: string;
      source_institution: string | null;
    }>
  >`
    SELECT
      ic.id,
      ic.source_id,
      ic.image_url,
      ic.caption,
      ic.metadata,
      ic.embedding <=> ${embeddingString}::vector AS distance,
      s.title AS source_title,
      s.url AS source_url,
      s.source_type,
      s.institution AS source_institution
    FROM "ImageChunk" ic
    JOIN "Source" s ON s.id = ic.source_id
    WHERE ic.embedding IS NOT NULL
      AND (1 - (ic.embedding <=> ${embeddingString}::vector) / 2) >= ${threshold}
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  // Transform results to match interface
  return results.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    imageUrl: row.image_url,
    caption: row.caption,
    metadata: row.metadata,
    distance: row.distance,
    similarity: 1 - row.distance / 2, // Convert distance to similarity score
    source: {
      id: row.source_id,
      title: row.source_title,
      url: row.source_url,
      sourceType: row.source_type,
      institution: row.source_institution,
    },
  }));
}
