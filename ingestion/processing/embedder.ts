/**
 * Text and Image Embedder with ACCURATE Token Counting using tiktoken
 * 
 * Uses @dqbd/tiktoken for exact token counts matching OpenAI's API
 */

import OpenAI from "openai";
import { encoding_for_model } from "@dqbd/tiktoken";
import type { ChunkData, ImageData } from "../scrapers/types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// OpenAI text-embedding-3-small limits
const MAX_TOKENS_PER_REQUEST = 8000; // Conservative (actual limit 8,192)
const MAX_TOKENS_PER_CHUNK = 8000; // Individual chunk limit
const EMBEDDING_MODEL = "text-embedding-3-small";
const COST_PER_1M_TOKENS = 0.02;

// Reusable encoder (important for performance)
let encoder: ReturnType<typeof encoding_for_model> | null = null;

function getEncoder() {
  if (!encoder) {
    encoder = encoding_for_model("text-embedding-3-small");
  }
  return encoder;
}

/**
 * Count exact tokens using tiktoken (cl100k_base encoding)
 */
function countTokens(text: string): number {
  const enc = getEncoder();
  const tokens = enc.encode(text);
  const count = tokens.length;
  return count;
}

// ============================================================================
// TEXT EMBEDDINGS
// ============================================================================

function createTokenLimitedBatches(
  chunks: ChunkData[],
  maxTokensPerBatch: number = MAX_TOKENS_PER_REQUEST
): ChunkData[][] {
  const batches: ChunkData[][] = [];
  let currentBatch: ChunkData[] = [];
  let currentTokenCount = 0;

  for (const chunk of chunks) {
    let processedChunk = chunk;
    let chunkTokens = countTokens(chunk.content);

    if (chunkTokens > MAX_TOKENS_PER_CHUNK) {
      console.warn(
        `⚠️  Chunk ${chunk.sourceId} too large (${chunkTokens} tokens). Truncating to ${MAX_TOKENS_PER_CHUNK}...`
      );
      
      let left = 0;
      let right = chunk.content.length;
      let bestLength = 0;
      
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const truncated = chunk.content.slice(0, mid);
        const tokens = countTokens(truncated + "...[truncated]");
        
        if (tokens <= MAX_TOKENS_PER_CHUNK) {
          bestLength = mid;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
      
      processedChunk = {
        ...chunk,
        content: chunk.content.slice(0, bestLength) + "...[truncated]",
      };
      chunkTokens = countTokens(processedChunk.content);
    }

    if (chunkTokens > maxTokensPerBatch * 0.9) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentTokenCount = 0;
      }
      
      batches.push([processedChunk]);
      continue;
    }

    if (currentTokenCount + chunkTokens > maxTokensPerBatch) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }
      currentBatch = [processedChunk];
      currentTokenCount = chunkTokens;
    } else {
      currentBatch.push(processedChunk);
      currentTokenCount += chunkTokens;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

async function generateEmbeddingBatch(
  chunks: ChunkData[],
  retries = 3
): Promise<Array<ChunkData & { embedding: number[] }>> {
  const texts = chunks.map((c) => c.content);
  const totalTokens = texts.reduce((sum, t) => sum + countTokens(t), 0);

  if (totalTokens > MAX_TOKENS_PER_REQUEST) {
    throw new Error(
      `Batch too large: ${totalTokens} tokens exceeds ${MAX_TOKENS_PER_REQUEST} limit`
    );
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
      });

      return chunks.map((chunk, i) => ({
        ...chunk,
        embedding: response.data[i].embedding,
      }));
    } catch (error: any) {
      if (error?.status === 400 && error?.message?.includes("maximum context length")) {
        if (chunks.length > 1) {
          console.log(`🔄 Emergency split: dividing batch in half...`);
          const mid = Math.floor(chunks.length / 2);
          const left = chunks.slice(0, mid);
          const right = chunks.slice(mid);
          
          const leftResults = await generateEmbeddingBatch(left, retries);
          const rightResults = await generateEmbeddingBatch(right, retries);
          
          return [...leftResults, ...rightResults];
        } else {
          throw new Error(`Single chunk ${chunks[0].sourceId} exceeds token limit`);
        }
      }

      if (error?.status === 429) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.warn(`⚠️  Rate limited. Waiting ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (attempt === retries) throw error;

      console.warn(`⚠️  Attempt ${attempt}/${retries} failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(`Failed after ${retries} retries`);
}

export async function generateTextEmbeddings(
  chunks: ChunkData[]
): Promise<Array<ChunkData & { embedding: number[] }>> {
  console.log(`\n🔢 Generating text embeddings for ${chunks.length} chunks...`);

  const batches = createTokenLimitedBatches(chunks);
  console.log(`   Split into ${batches.length} batches (token-limited)`);

  const results: Array<ChunkData & { embedding: number[] }> = [];
  let totalCost = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchTokens = batch.reduce((sum, c) => sum + countTokens(c.content), 0);
    
    console.log(
      `   Batch ${i + 1}/${batches.length} (${batch.length} chunks, ~${batchTokens.toLocaleString()} tokens)...`
    );

    const batchResults = await generateEmbeddingBatch(batch);
    results.push(...batchResults);

    const batchCost = (batchTokens / 1_000_000) * COST_PER_1M_TOKENS;
    totalCost += batchCost;
    console.log(`   Cost so far: $${totalCost.toFixed(4)}`);
    console.log(`   ✓ Progress: ${results.length}/${chunks.length} (${Math.round((results.length / chunks.length) * 100)}%)`);

    if (i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(`\n✅ Generated ${results.length} embeddings`);
  console.log(`   Total cost: $${totalCost.toFixed(4)}`);

  if (encoder) {
    encoder.free();
    encoder = null;
  }

  return results;
}

// ============================================================================
// IMAGE EMBEDDINGS
// ============================================================================

function createImageEmbeddingText(image: ImageData): string {
  const parts: string[] = [];
  
  if (image.altText) parts.push(image.altText);
  if (image.caption) parts.push(image.caption);
  
  if (image.contextText) {
    const context = image.contextText.length > 500 
      ? image.contextText.slice(0, 500) + "..."
      : image.contextText;
    parts.push(context);
  }
  
  if (image.metadata.category) {
    parts.push(`Image category: ${image.metadata.category}`);
  }
  if (image.metadata.crop) {
    parts.push(`Crop: ${image.metadata.crop}`);
  }
  if (image.metadata.subject) {
    parts.push(`Subject: ${image.metadata.subject}`);
  }
  
  return parts.join(". ");
}

function createImageBatches(
  images: ImageData[],
  maxTokensPerBatch: number = MAX_TOKENS_PER_REQUEST
): ImageData[][] {
  const batches: ImageData[][] = [];
  let currentBatch: ImageData[] = [];
  let currentTokenCount = 0;

  for (const image of images) {
    const embeddingText = createImageEmbeddingText(image);
    const tokens = countTokens(embeddingText);

    if (currentTokenCount + tokens > maxTokensPerBatch && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [image];
      currentTokenCount = tokens;
    } else {
      currentBatch.push(image);
      currentTokenCount += tokens;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

async function generateImageEmbeddingBatch(
  images: ImageData[],
  retries = 3
): Promise<Array<ImageData & { embedding: number[] }>> {
  const texts = images.map(img => createImageEmbeddingText(img));
  const totalTokens = texts.reduce((sum, t) => sum + countTokens(t), 0);

  if (totalTokens > MAX_TOKENS_PER_REQUEST) {
    throw new Error(`Image batch too large: ${totalTokens} tokens`);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
        dimensions: 512 
      });

      return images.map((image, i) => ({
        ...image,
        embedding: response.data[i].embedding,
      }));
    } catch (error: any) {
      if (error?.status === 429) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.warn(`⚠️  Rate limited. Waiting ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (error?.status === 400 && error?.message?.includes("maximum context length")) {
        if (images.length > 1) {
          console.log(`🔄 Emergency split: dividing image batch...`);
          const mid = Math.floor(images.length / 2);
          const leftResults = await generateImageEmbeddingBatch(images.slice(0, mid), retries);
          const rightResults = await generateImageEmbeddingBatch(images.slice(mid), retries);
          return [...leftResults, ...rightResults];
        }
      }

      if (attempt === retries) throw error;
      console.warn(`⚠️  Image batch attempt ${attempt}/${retries} failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(`Failed after ${retries} retries`);
}

export async function generateImageEmbeddings(
  images: ImageData[]
): Promise<Array<ImageData & { embedding: number[] }>> {
  console.log(`\n🖼️  Generating image embeddings for ${images.length} images...`);
  console.log(`   Using text-embedding-3-small (alt text + caption + context)`);

  const batches = createImageBatches(images);
  console.log(`   Split into ${batches.length} batches\n`);

  const results: Array<ImageData & { embedding: number[] }> = [];
  let totalCost = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchTexts = batch.map(img => createImageEmbeddingText(img));
    const batchTokens = batchTexts.reduce((sum, t) => sum + countTokens(t), 0);
    
    console.log(`   Batch ${i + 1}/${batches.length} (${batch.length} images, ~${batchTokens.toLocaleString()} tokens)...`);

    const batchResults = await generateImageEmbeddingBatch(batch);
    results.push(...batchResults);

    const batchCost = (batchTokens / 1_000_000) * COST_PER_1M_TOKENS;
    totalCost += batchCost;
    console.log(`   Cost so far: $${totalCost.toFixed(4)}`);
    console.log(`   ✓ Progress: ${results.length}/${images.length} (${Math.round((results.length / images.length) * 100)}%)\n`);

    if (i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(`✅ Generated ${results.length} image embeddings`);
  console.log(`   Total cost: $${totalCost.toFixed(4)}`);

  return results;
}

process.on("exit", () => {
  if (encoder) {
    encoder.free();
  }
});
