import { prisma } from "@/lib/prisma";
import { generateImageEmbedding } from "@/lib/ai/embeddings/image";
import { uploadToR2, generateImageKey } from "@/lib/storage/r2";

export interface ImageChunkInput {
  sourceId: string;
  imageUrl: string;
  caption?: string;
  metadata?: Record<string, any>;
}

export interface ImageChunkResult {
  id: string;
  sourceId: string;
  imageUrl: string;
  caption: string | null;
  embedding: number[] | null;
  r2Uploaded: boolean;
}

export interface BatchUpsertResult {
  total: number;
  succeeded: number;
  failed: number;
  results: ImageChunkResult[];
  errors: Array<{ input: ImageChunkInput; error: string }>;
}

/**
 * Upload an external image to R2 if it's not already in our bucket
 *
 * @param imageUrl - URL of the image to upload
 * @returns URL of the image in R2, or original URL if already in R2
 */
export async function ensureImageInR2(imageUrl: string): Promise<string> {
  const publicUrl = process.env.R2_PUBLIC_URL || "";

  // Check if image is already in our R2 bucket
  if (publicUrl && imageUrl.startsWith(publicUrl)) {
    return imageUrl;
  }

  // Fetch the external image
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch image: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Determine content type
  const contentType = response.headers.get("content-type") || "image/jpeg";

  // Generate unique key for the image
  const key = generateImageKey(imageUrl);

  // Upload to R2
  const result = await uploadToR2(buffer, key, contentType);

  return result.url;
}

/**
 * Upsert an image chunk with automatic embedding generation
 *
 * @param input - Image chunk input data
 * @returns Created or updated image chunk
 */
export async function upsertImageChunk(
  input: ImageChunkInput
): Promise<ImageChunkResult> {
  // Upload external image to R2 if needed
  let finalImageUrl = input.imageUrl;
  let r2Uploaded = false;

  try {
    // Only upload to R2 if the image is from an external URL
    if (input.imageUrl.startsWith("http")) {
      finalImageUrl = await ensureImageInR2(input.imageUrl);
      r2Uploaded = finalImageUrl !== input.imageUrl;
    }
  } catch (error) {
    console.error("Failed to upload image to R2:", error);
    // Continue with original URL if R2 upload fails
  }

  // Generate CLIP embedding for the image
  let embedding: number[] | null = null;

  try {
    const embeddingResult = await generateImageEmbedding(finalImageUrl);
    embedding = embeddingResult.embedding;
  } catch (error) {
    console.error("Failed to generate image embedding:", error);
    // Continue without embedding if generation fails
  }

  // Prisma does not support pgvector types; cast is required
  const embeddingValue =
    embedding ? (`[${embedding.join(",")}]` as any) : undefined;
  // Upsert the image chunk in the database
  const imageChunk = await prisma.imageChunk.upsert({
    where: {
      // Use composite unique constraint on sourceId + imageUrl
      sourceId_imageUrl: {
        sourceId: input.sourceId,
        imageUrl: finalImageUrl,
      },
    },
    // Prisma does not type pgvector fields; a narrow cast is required to persist embeddings.
    update: {
      caption: input.caption,
      embedding: embeddingValue,
      metadata: input.metadata ?? undefined,
    } as any,
    create: {
      sourceId: input.sourceId,
      imageUrl: finalImageUrl,
      caption: input.caption,
      embedding: embeddingValue,
      metadata: input.metadata ?? undefined,
    } as any,
  });

  return {
    id: imageChunk.id,
    sourceId: imageChunk.sourceId,
    imageUrl: imageChunk.imageUrl,
    caption: imageChunk.caption,
    embedding,
    r2Uploaded,
  };
}

/**
 * Upsert multiple image chunks with rate limiting and error handling
 *
 * @param inputs - Array of image chunk inputs
 * @param concurrency - Number of concurrent operations (default: 3)
 * @param onProgress - Optional progress callback
 */
export async function upsertBatchImageChunks(
  inputs: ImageChunkInput[],
  concurrency: number = 3,
  onProgress?: (
    current: number,
    total: number,
    succeeded: number,
    failed: number
  ) => void
): Promise<BatchUpsertResult> {
  const results: ImageChunkResult[] = [];
  const errors: Array<{ input: ImageChunkInput; error: string }> = [];
  let succeeded = 0;
  let failed = 0;

  // Process in batches with concurrency control
  for (let i = 0; i < inputs.length; i += concurrency) {
    const batch = inputs.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map((input) => upsertImageChunk(input))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const input = batch[j];

      if (result.status === "fulfilled") {
        results.push(result.value);
        succeeded++;
      } else {
        const errorMessage =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        errors.push({ input, error: errorMessage });
        failed++;
        console.error("Failed to upsert image chunk:", errorMessage);
      }
    }

    if (onProgress) {
      onProgress(i + batch.length, inputs.length, succeeded, failed);
    }

    // Add delay between batches to respect rate limits
    if (i + concurrency < inputs.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return {
    total: inputs.length,
    succeeded,
    failed,
    results,
    errors,
  };
}
