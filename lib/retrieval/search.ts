import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "@/lib/embeddings/generate";

const TEXT_EMBEDDING_DIMENSIONS = 1536
const IMAGE_EMBEDDING_DIMENSIONS = 512
export interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  sourceId: string;
  metadata: any;
}

/**
 * Search text chunks using vector similarity
 */
export async function searchTextChunks(
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query, TEXT_EMBEDDING_DIMENSIONS);
  const embeddingString = `[${embedding.join(",")}]`;

  const results = await prisma.$queryRaw<any[]>`
    SELECT
      id,
      content,
      "sourceId",
      metadata,
      1 - (embedding <=> ${embeddingString}::vector) as similarity
    FROM "TextChunk"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingString}::vector
    LIMIT ${limit}
  `;

  return results.map((r) => ({
    id: r.id,
    content: r.content,
    similarity: r.similarity,
    sourceId: r.sourceId,
    metadata: r.metadata,
  }));
}

/**
 * Search image chunks using vector similarity
 */
export async function searchImageChunks(
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query, IMAGE_EMBEDDING_DIMENSIONS);
  const embeddingString = `[${embedding.join(",")}]`;

  const results = await prisma.$queryRaw<any[]>`
    SELECT
      id,
      "imageUrl" as content,
      caption,
      "sourceId",
      metadata,
      1 - (embedding <=> ${embeddingString}::vector) as similarity
    FROM "ImageChunk"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingString}::vector
    LIMIT ${limit}
  `;

  return results.map((r) => ({
    id: r.id,
    content: r.caption || r.content,
    similarity: r.similarity,
    sourceId: r.sourceId,
    metadata: r.metadata,
  }));
}
