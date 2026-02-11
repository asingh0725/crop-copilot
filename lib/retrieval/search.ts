import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "@/lib/embeddings/generate";

const TEXT_EMBEDDING_DIMENSIONS = 1536;
const IMAGE_EMBEDDING_DIMENSIONS = 512;

export interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  sourceId: string;
  metadata: any;
  rankScore?: number;
}

export interface SearchOptions {
  candidateMultiplier?: number;
  minSimilarity?: number;
  keywordBoost?: number;
  crop?: string;
  topics?: string[];
  region?: string;
  sourceBoosts?: Record<string, number>;
}

const DEFAULT_OPTIONS: Required<SearchOptions> = {
  candidateMultiplier: 4,
  minSimilarity: 0.2,
  keywordBoost: 0.08,
  crop: undefined,
  topics: [],
  region: undefined,
  sourceBoosts: {},
};

const STOPWORDS = new Set([
  "about",
  "after",
  "before",
  "between",
  "could",
  "should",
  "would",
  "with",
  "from",
  "this",
  "that",
  "have",
  "has",
  "had",
  "were",
  "been",
  "into",
  "your",
  "their",
  "crop",
  "plant",
  "field",
  "soil",
  "stage",
  "growth",
  "location",
  "symptom",
  "symptoms",
  "issue",
  "issues",
  "notes",
  "report",
]);

function extractKeywords(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));

  return Array.from(new Set(tokens)).slice(0, 10);
}

function applyKeywordBoost(
  results: SearchResult[],
  query: string,
  options: Required<SearchOptions>
): SearchResult[] {
  const keywords = extractKeywords(query);
  const crop = options.crop?.toLowerCase();
  const topics = (options.topics || []).map((t) => t.toLowerCase());
  const region = options.region?.toLowerCase();

  if (keywords.length === 0) {
    return results.map((result) => ({
      ...result,
      rankScore: result.similarity,
    }));
  }

  return results.map((result) => {
    const content = (result.content || "").toLowerCase();
    let matches = 0;
    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        matches += 1;
      }
    }
    const keywordScore = matches / keywords.length;
    const meta = (result.metadata || {}) as Record<string, any>;
    let metaBoost = 0;
    if (crop && Array.isArray(meta.crops) && meta.crops.length > 0) {
      const match = meta.crops.some(
        (c: string) => c.toLowerCase() === crop
      );
      if (match) metaBoost += 0.06;
    }
    if (topics.length > 0 && Array.isArray(meta.topics)) {
      const topicMatches = meta.topics.filter((t: string) =>
        topics.includes(String(t).toLowerCase())
      ).length;
      if (topicMatches > 0) {
        metaBoost += Math.min(0.06, topicMatches * 0.02);
      }
    }
    if (region && typeof meta.region === "string") {
      if (meta.region.toLowerCase().includes(region)) {
        metaBoost += 0.03;
      }
    }

    const sourceBoost = options.sourceBoosts[result.sourceId] || 0;
    const boosted = Math.min(
      1,
      result.similarity +
        keywordScore * options.keywordBoost +
        metaBoost +
        sourceBoost
    );

    return {
      ...result,
      rankScore: boosted,
    };
  });
}

/**
 * Search text chunks using vector similarity
 */
export async function searchTextChunks(
  query: string,
  limit: number = 5,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const candidateLimit = Math.max(
    limit,
    limit * resolvedOptions.candidateMultiplier
  );
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
    LIMIT ${candidateLimit}
  `;

  const mapped = results.map((r) => ({
    id: r.id,
    content: r.content,
    similarity: r.similarity,
    sourceId: r.sourceId,
    metadata: r.metadata,
  }));

  const boosted = applyKeywordBoost(mapped, query, resolvedOptions).filter(
    (result) => result.similarity >= resolvedOptions.minSimilarity
  );

  return boosted
    .sort(
      (a, b) =>
        (b.rankScore ?? b.similarity) - (a.rankScore ?? a.similarity)
    )
    .slice(0, limit);
}

/**
 * Search image chunks using vector similarity
 */
export async function searchImageChunks(
  query: string,
  limit: number = 5,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const candidateLimit = Math.max(
    limit,
    limit * resolvedOptions.candidateMultiplier
  );
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
    LIMIT ${candidateLimit}
  `;

  const mapped = results.map((r) => ({
    id: r.id,
    content: r.caption || r.content,
    similarity: r.similarity,
    sourceId: r.sourceId,
    metadata: r.metadata,
  }));

  const boosted = applyKeywordBoost(mapped, query, resolvedOptions).filter(
    (result) => result.similarity >= resolvedOptions.minSimilarity
  );

  return boosted
    .sort(
      (a, b) =>
        (b.rankScore ?? b.similarity) - (a.rankScore ?? a.similarity)
    )
    .slice(0, limit);
}

export async function fetchRequiredTextChunks(
  query: string,
  sourceIds: string[]
): Promise<SearchResult[]> {
  if (!sourceIds || sourceIds.length === 0) return [];
  const embedding = await generateEmbedding(query, TEXT_EMBEDDING_DIMENSIONS);
  const embeddingString = `[${embedding.join(",")}]`;

  const results = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT ON ("sourceId")
      id,
      content,
      "sourceId",
      metadata,
      1 - (embedding <=> ${embeddingString}::vector) as similarity
    FROM "TextChunk"
    WHERE embedding IS NOT NULL
      AND "sourceId" IN (${Prisma.join(sourceIds)})
    ORDER BY "sourceId", embedding <=> ${embeddingString}::vector
  `;

  return results.map((r) => ({
    id: r.id,
    content: r.content,
    similarity: r.similarity,
    sourceId: r.sourceId,
    metadata: r.metadata,
  }));
}
