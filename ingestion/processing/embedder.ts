import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { ChunkData, ProcessedImage, CostTracker } from "../scrapers/types";
import { countTokens } from "./chunker";

let openai: OpenAI | null = null;
let anthropic: Anthropic | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

function getAnthropic(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

const TEXT_EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100; // OpenAI allows up to 2048, but 100 is safer
const IMAGE_BATCH_SIZE = 5; // Claude Vision batching
const MAX_RETRIES = 3;

/**
 * Generate embeddings for text chunks with batching and cost tracking
 */
export async function generateTextEmbeddings(
  chunks: ChunkData[],
  costTracker?: CostTracker
): Promise<Array<ChunkData & { embedding: number[] }>> {
  const totalChunks = chunks.length;
  const results: Array<ChunkData & { embedding: number[] }> = [];

  console.log(`\n🔢 Generating text embeddings for ${totalChunks} chunks...`);

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

    console.log(
      `   Batch ${batchNum}/${totalBatches} (${batch.length} chunks)...`
    );

    try {
      const embeddings = await generateEmbeddingBatch(
        batch.map((c) => c.content)
      );

      // Combine chunks with embeddings
      for (let j = 0; j < batch.length; j++) {
        results.push({
          ...batch[j],
          embedding: embeddings[j],
        });
      }

      // Update cost tracker
      if (costTracker) {
        const tokens = batch.reduce((sum, c) => sum + c.tokenCount, 0);
        costTracker.textTokens += tokens;
        costTracker.textCost = (costTracker.textTokens / 1_000_000) * 0.02; // $0.02 per 1M tokens
        costTracker.totalCost = costTracker.textCost + costTracker.imageCost;

        console.log(
          `   Cost so far: $${costTracker.totalCost.toFixed(4)} (${tokens.toLocaleString()} tokens this batch)`
        );
      }

      // Progress
      const percent = Math.round(((i + batch.length) / totalChunks) * 100);
      console.log(
        `   ✓ Progress: ${i + batch.length}/${totalChunks} (${percent}%)`
      );
    } catch (error) {
      console.error(`   ✗ Failed to embed batch ${batchNum}:`, error);
      throw error;
    }
  }

  console.log(`✅ Text embedding complete: ${results.length} chunks embedded`);

  return results;
}

/**
 * Generate embeddings for a batch of texts with retry logic
 */
async function generateEmbeddingBatch(
  texts: string[],
  attempt = 1
): Promise<number[][]> {
  try {
    const response = await getOpenAI().embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
      encoding_format: "float",
      dimensions: TEXT_EMBEDDING_DIMENSIONS,
    });

    return response.data.map((item) => item.embedding);
  } catch (error: any) {
    // Handle rate limits with exponential backoff
    if (error?.status === 429 && attempt < MAX_RETRIES) {
      const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      console.log(`   Rate limited. Waiting ${waitTime}ms before retry ${attempt}/${MAX_RETRIES}...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return generateEmbeddingBatch(texts, attempt + 1);
    }

    throw error;
  }
}

/**
 * Generate embeddings for images (Claude Vision description + OpenAI embedding)
 */
export async function generateImageEmbeddings(
  images: ProcessedImage[],
  costTracker?: CostTracker
): Promise<Array<ProcessedImage & { embedding: number[] }>> {
  const totalImages = images.length;
  const results: Array<ProcessedImage & { embedding: number[] }> = [];

  console.log(`\n🖼️  Generating image embeddings for ${totalImages} images...`);

  for (let i = 0; i < images.length; i += IMAGE_BATCH_SIZE) {
    const batch = images.slice(i, i + IMAGE_BATCH_SIZE);
    const batchNum = Math.floor(i / IMAGE_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(images.length / IMAGE_BATCH_SIZE);

    console.log(
      `   Batch ${batchNum}/${totalBatches} (${batch.length} images)...`
    );

    try {
      // Generate descriptions using Claude Vision
      const descriptions = await Promise.all(
        batch.map((img) => generateImageDescription(img.r2Url))
      );

      // Generate embeddings from descriptions
      const embeddings = await generateEmbeddingBatch(descriptions);

      // Combine with images
      for (let j = 0; j < batch.length; j++) {
        results.push({
          ...batch[j],
          caption: descriptions[j],
          embedding: embeddings[j],
        });
      }

      // Update cost tracker
      if (costTracker) {
        // Claude Vision cost: ~$3 per 1M input tokens
        // Rough estimate: 1 image = ~1000 input tokens for Claude
        const claudeTokens = batch.length * 1000;
        costTracker.imageDescriptions += batch.length;
        costTracker.imageCost = (costTracker.imageDescriptions * 1000 / 1_000_000) * 3.0;

        // OpenAI embedding cost for descriptions
        const descTokens = descriptions.reduce(
          (sum, desc) => sum + countTokens(desc),
          0
        );
        costTracker.textTokens += descTokens;
        costTracker.textCost = (costTracker.textTokens / 1_000_000) * 0.02;

        costTracker.totalCost = costTracker.textCost + costTracker.imageCost;

        console.log(
          `   Cost so far: $${costTracker.totalCost.toFixed(4)} (${batch.length} images this batch)`
        );
      }

      // Progress
      const percent = Math.round(((i + batch.length) / totalImages) * 100);
      console.log(
        `   ✓ Progress: ${i + batch.length}/${totalImages} (${percent}%)`
      );
    } catch (error) {
      console.error(`   ✗ Failed to process image batch ${batchNum}:`, error);
      throw error;
    }
  }

  console.log(`✅ Image embedding complete: ${results.length} images embedded`);

  return results;
}

/**
 * Generate description for an image using Claude Vision
 */
async function generateImageDescription(
  imageUrl: string,
  attempt = 1
): Promise<string> {
  try {
    const message = await getAnthropic().messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "url",
                url: imageUrl,
              },
            },
            {
              type: "text",
              text: "Describe this agricultural image in 2-3 sentences, focusing on visible symptoms, conditions, or features relevant to crop diagnosis. Include crop type if identifiable, symptom location (leaves, stems, roots, fruit), symptom appearance (color, pattern, texture), and severity if apparent.",
            },
          ],
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in Claude response");
    }

    return textContent.text;
  } catch (error: any) {
    // Handle rate limits with exponential backoff
    if (
      (error?.status === 429 || error?.error?.type === "rate_limit_error") &&
      attempt < MAX_RETRIES
    ) {
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(
        `   Rate limited on image. Waiting ${waitTime}ms before retry ${attempt}/${MAX_RETRIES}...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return generateImageDescription(imageUrl, attempt + 1);
    }

    console.error(`Failed to describe image ${imageUrl}:`, error);
    // Return fallback description
    return "Agricultural image - description generation failed";
  }
}

/**
 * Log cost summary
 */
export function logCosts(tracker: CostTracker): void {
  console.log(`\n💰 Cost Summary:`);
  console.log(
    `   Text embeddings: ${tracker.textTokens.toLocaleString()} tokens = $${tracker.textCost.toFixed(4)}`
  );
  console.log(
    `   Image descriptions: ${tracker.imageDescriptions} images = $${tracker.imageCost.toFixed(4)}`
  );
  console.log(`   Total: $${tracker.totalCost.toFixed(4)}`);
}
