import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 100;

// Pricing: $0.02 per 1M tokens
const COST_PER_MILLION_TOKENS = 0.02;

export interface TextEmbeddingResult {
  embedding: number[];
  tokens: number;
  model: string;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  totalTokens: number;
  model: string;
  estimatedCost: number;
}

/**
 * Generate embedding for a single text string
 */
export async function generateTextEmbedding(
  text: string
): Promise<TextEmbeddingResult> {
  if (!text || text.trim().length === 0) {
    throw new Error("Text cannot be empty");
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const embedding = response.data[0].embedding;
  const tokens = response.usage.total_tokens;

  return {
    embedding,
    tokens,
    model: EMBEDDING_MODEL,
  };
}

/**
 * Generate embeddings for multiple texts in a single batch request
 * OpenAI supports up to 100 texts per request
 */
export async function generateBatchTextEmbeddings(
  texts: string[]
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    throw new Error("Texts array cannot be empty");
  }

  if (texts.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size cannot exceed ${MAX_BATCH_SIZE} texts`);
  }

  // Filter out empty strings
  const validTexts = texts.filter((t) => t && t.trim().length > 0);

  if (validTexts.length === 0) {
    throw new Error("No valid texts provided");
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: validTexts,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const embeddings = response.data.map((item) => item.embedding);
  const totalTokens = response.usage.total_tokens;
  const estimatedCost = (totalTokens / 1_000_000) * COST_PER_MILLION_TOKENS;

  return {
    embeddings,
    totalTokens,
    model: EMBEDDING_MODEL,
    estimatedCost,
  };
}

/**
 * Estimate the cost of generating embeddings for a given number of texts
 *
 * @param textCount - Number of texts to embed
 * @param avgTokensPerText - Average tokens per text (default: 100)
 * @returns Estimated cost in USD
 */
export function estimateEmbeddingCost(
  textCount: number,
  avgTokensPerText: number = 100
): number {
  const totalTokens = textCount * avgTokensPerText;
  return (totalTokens / 1_000_000) * COST_PER_MILLION_TOKENS;
}

/**
 * Process a large array of texts in batches
 * Useful when you have more than 100 texts to embed
 */
export async function generateLargeBatchEmbeddings(
  texts: string[],
  onProgress?: (current: number, total: number) => void
): Promise<BatchEmbeddingResult> {
  const batches: string[][] = [];

  // Split into batches of MAX_BATCH_SIZE
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    batches.push(texts.slice(i, i + MAX_BATCH_SIZE));
  }

  const allEmbeddings: number[][] = [];
  let totalTokens = 0;
  let totalCost = 0;

  for (let i = 0; i < batches.length; i++) {
    const result = await generateBatchTextEmbeddings(batches[i]);
    allEmbeddings.push(...result.embeddings);
    totalTokens += result.totalTokens;
    totalCost += result.estimatedCost;

    if (onProgress) {
      onProgress(i + 1, batches.length);
    }

    // Add a small delay between batches to respect rate limits
    if (i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return {
    embeddings: allEmbeddings,
    totalTokens,
    model: EMBEDDING_MODEL,
    estimatedCost: totalCost,
  };
}
