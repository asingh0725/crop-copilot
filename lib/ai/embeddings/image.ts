import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;

// Pricing: ~$0.0002 per image (estimated)
const COST_PER_MILLION_TOKENS = 0.02;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const RETRY_BACKOFF_FACTOR = 2;

export interface ImageEmbeddingResult {
  embedding: number[];
  tokens: number;
  model: string;
  dimensions: number;
}

export interface BatchImageEmbeddingResult {
  embeddings: number[][];
  totalImages: number;
  totalTokens: number;
  model: string;
  estimatedCost: number;
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateImageEmbedding(
  imageUrl: string,
  retries: number = MAX_RETRIES
): Promise<ImageEmbeddingResult> {
  if (!imageUrl || imageUrl.trim().length === 0) {
    throw new Error("Image URL cannot be empty");
  }

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: imageUrl, // image URL is valid input
        dimensions: EMBEDDING_DIMENSIONS,
      });

      const embedding = response.data[0].embedding;
      const tokens = response.usage.total_tokens;

      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Invalid embedding length: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`
        );
      }

      return {
        embedding,
        tokens,
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        const delayMs =
          INITIAL_RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1);
        await sleep(delayMs);
      }
    }
  }

  throw new Error(
    `Failed to generate image embedding after ${retries} attempts: ${lastError?.message}`
  );
}

/**
 * Generate embeddings for multiple images (batched, cost-aware)
 */
export async function generateBatchImageEmbeddings(
  imageUrls: string[]
): Promise<BatchImageEmbeddingResult> {
  if (imageUrls.length === 0) {
    throw new Error("Image URLs array cannot be empty");
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: imageUrls,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const embeddings = response.data.map((item) => item.embedding);
  const totalTokens = response.usage.total_tokens;
  const estimatedCost = (totalTokens / 1_000_000) * COST_PER_MILLION_TOKENS;

  return {
    embeddings,
    totalImages: imageUrls.length,
    totalTokens,
    model: EMBEDDING_MODEL,
    estimatedCost,
  };
}

/**
 * Estimate cost for image embeddings
 */
export function estimateImageEmbeddingCost(
  imageCount: number,
  avgTokensPerImage: number = 100
): number {
  const totalTokens = imageCount * avgTokensPerImage;
  return (totalTokens / 1_000_000) * COST_PER_MILLION_TOKENS;
}

export async function generateImageEmbeddingFromBase64(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg",
  retries: number = MAX_RETRIES
): Promise<ImageEmbeddingResult> {
  if (!base64 || base64.trim().length === 0) {
    throw new Error("Base64 data cannot be empty");
  }

  const dataUri = `data:${mediaType};base64,${base64}`;

  return generateImageEmbedding(dataUri, retries);
}
