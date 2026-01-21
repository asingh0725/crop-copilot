/**
 * End-to-End Ingestion Pipeline Test
 *
 * This script validates that all ingestion components work together by:
 * 1. Scraping a sample university extension page
 * 2. Chunking the content
 * 3. Generating text embeddings
 * 4. Extracting and processing images
 * 5. Generating image embeddings
 * 6. Upserting to pgvector
 * 7. Verifying vector search functionality
 */

import { chromium } from "playwright";
import * as cheerio from "cheerio";
import { prisma } from "../lib/prisma";
import {
  registerSource,
  markSourceAsCompleted,
  markSourceAsFailed,
  deleteSource,
} from "../lib/ingestion/services/source-tracker";
import { generateBatchTextEmbeddings } from "../lib/ai/embeddings/text";
import { generateImageEmbedding } from "../lib/ai/embeddings/image";
import { upsertImageChunk } from "../lib/ingestion/services/image-upsert";
import {
  searchSimilarTextChunks,
  searchSimilarImages,
} from "../lib/db/vector-search";

// Test configuration
const TEST_URL =
  "https://crops.extension.iastate.edu/encyclopedia/nitrogen-deficiency-corn";
const TEST_TITLE = "Nitrogen Deficiency in Corn - Iowa State Extension";
const CHUNK_SIZE = 500; // characters per chunk
const MIN_CHUNK_SIZE = 100; // minimum viable chunk size

interface TestStats {
  sourceId?: string;
  sourceCreated?: boolean;
  textChunks: number;
  imageChunks: number;
  textEmbeddings: number;
  imageEmbeddings: number;
  searchResultsText: number;
  searchResultsImage: number;
  startTime: number;
  endTime?: number;
  success: boolean;
  error?: string;
}

const stats: TestStats = {
  textChunks: 0,
  imageChunks: 0,
  textEmbeddings: 0,
  imageEmbeddings: 0,
  searchResultsText: 0,
  searchResultsImage: 0,
  startTime: Date.now(),
  success: false,
};

/**
 * Split text into chunks for embedding
 */
function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();

    if (currentChunk.length + trimmed.length <= chunkSize) {
      currentChunk += (currentChunk ? " " : "") + trimmed;
    } else {
      if (currentChunk.length >= MIN_CHUNK_SIZE) {
        chunks.push(currentChunk);
      }
      currentChunk = trimmed;
    }
  }

  if (currentChunk.length >= MIN_CHUNK_SIZE) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Step 1: Scrape sample university extension page
 */
async function scrapePage(url: string): Promise<{
  title: string;
  content: string;
  imageUrls: string[];
}> {
  console.log("\n📥 Step 1: Scraping page...");
  console.log(`URL: ${url}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const content = await page.content();
    const $ = cheerio.load(content);

    // Extract title
    const title =
      $("h1").first().text().trim() || $("title").text().trim() || "Untitled";

    // Extract main content (skip navigation, footer, etc.)
    const mainContent = $("main, article, .content, #content")
      .first()
      .text()
      .trim();

    // Extract images
    const imageUrls: string[] = [];
    $("img").each((_, elem) => {
      const src = $(elem).attr("src");
      if (src && !src.includes("logo") && !src.includes("icon")) {
        const absoluteUrl = new URL(src, url).href;
        imageUrls.push(absoluteUrl);
      }
    });

    console.log(`✅ Scraped successfully`);
    console.log(`   Title: ${title}`);
    console.log(`   Content length: ${mainContent.length} characters`);
    console.log(`   Images found: ${imageUrls.length}`);

    return {
      title,
      content: mainContent,
      imageUrls,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Step 2: Register source and chunk content
 */
async function registerAndChunkSource(
  url: string,
  title: string,
  content: string
): Promise<{ sourceId: string; chunks: string[] }> {
  console.log("\n📝 Step 2: Registering source and chunking content...");

  // Register source
  const { source, created } = await registerSource({
    title,
    url,
    sourceType: "UNIVERSITY_EXTENSION",
    institution: "Iowa State University",
  });

  stats.sourceId = source.id;
  stats.sourceCreated = created;
  console.log(`✅ Source registered: ${source.id}`);

  // Chunk content
  const chunks = chunkText(content, CHUNK_SIZE);
  stats.textChunks = chunks.length;

  console.log(`✅ Created ${chunks.length} text chunks`);

  return {
    sourceId: source.id,
    chunks,
  };
}

/**
 * Step 3: Generate text embeddings and save to database
 */
async function processTextChunks(
  sourceId: string,
  chunks: string[]
): Promise<void> {
  console.log("\n🔢 Step 3: Generating text embeddings...");

  if (chunks.length === 0) {
    console.log("⚠️  No text chunks to process");
    return;
  }

  // Generate embeddings (batch API call)
  const embeddingResult = await generateBatchTextEmbeddings(chunks);
  stats.textEmbeddings = embeddingResult.embeddings.length;

  console.log(`✅ Generated ${embeddingResult.embeddings.length} embeddings`);
  console.log(`   Total tokens: ${embeddingResult.totalTokens}`);
  console.log(
    `   Estimated cost: $${embeddingResult.estimatedCost.toFixed(6)}`
  );

  // Save to database
  console.log("\n💾 Saving text chunks to database...");

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddingResult.embeddings[i];

    const textChunk = await prisma.textChunk.create({
      data: {
        sourceId,
        content: chunk,
        metadata: {
          chunkIndex: i,
          chunkSize: chunk.length,
        },
      },
    });

    // pgvector write must use raw SQL (Prisma does not support vector fields)
    await prisma.$executeRawUnsafe(`
      UPDATE "TextChunk"
      SET embedding = '[${embedding.join(",")}]'
      WHERE id = '${textChunk.id}'
    `);
  }

  console.log(`✅ Saved ${chunks.length} text chunks to database`);
}

/**
 * Step 4: Process one image (extract, generate embedding, upsert)
 */
async function processImage(sourceId: string, imageUrl: string): Promise<void> {
  console.log("\n🖼️  Step 4: Processing image...");
  console.log(`Image URL: ${imageUrl}`);

  try {
    // Use the image upsert service which handles:
    // - R2 upload (if needed)
    // - Embedding generation
    // - Database upsert
    const result = await upsertImageChunk({
      sourceId,
      imageUrl,
      caption: "Nitrogen deficiency symptoms in corn",
      metadata: {
        testImage: true,
      },
    });

    if (result.embedding) {
      stats.imageChunks = 1;
      stats.imageEmbeddings = 1;
    }

    console.log(`✅ Image processed successfully`);
    console.log(`   Image chunk ID: ${result.id}`);
    console.log(`   R2 uploaded: ${result.r2Uploaded}`);
    console.log(`   Embedding generated: ${result.embedding ? "Yes" : "No"}`);
  } catch (error) {
    console.error(`❌ Failed to process image:`, error);
    throw error;
  }
}

/**
 * Step 5: Verify vector search functionality
 */
async function verifyVectorSearch(sourceId: string): Promise<void> {
  console.log("\n🔍 Step 5: Verifying vector search...");

  // Test text search
  console.log("\n📝 Testing text vector search...");
  const testQuery = "nitrogen deficiency symptoms yellow leaves";

  // Generate embedding for test query
  const queryEmbeddingResult = await generateBatchTextEmbeddings([testQuery]);
  const queryEmbedding = queryEmbeddingResult.embeddings[0];

  // Search for similar text chunks
  const textResults = await searchSimilarTextChunks(queryEmbedding, 3, 0.5);
  stats.searchResultsText = textResults.length;

  console.log(`✅ Found ${textResults.length} similar text chunks`);
  if (textResults.length > 0) {
    console.log(
      `   Top result similarity: ${(textResults[0].similarity * 100).toFixed(1)}%`
    );
    console.log(
      `   Content preview: ${textResults[0].content.substring(0, 100)}...`
    );
  }

  // Test image search (if we have an image embedding)
  const imageChunks = await prisma.imageChunk.findMany({
    where: { sourceId },
  });

  const embedding = (imageChunks[0] as any).embedding;

  if (imageChunks.length > 0 && embedding) {
    console.log("\n🖼️  Testing image vector search...");

    // Get the embedding of our test image
    const testImageEmbedding = embedding as any as string;
    const embeddingArray = JSON.parse(
      testImageEmbedding.replace(/^{/, "[").replace(/}$/, "]")
    );

    // Search for similar images
    const imageResults = await searchSimilarImages(embeddingArray, 3, 0.5);
    stats.searchResultsImage = imageResults.length;

    console.log(`✅ Found ${imageResults.length} similar images`);
    if (imageResults.length > 0) {
      console.log(
        `   Top result similarity: ${(imageResults[0].similarity * 100).toFixed(1)}%`
      );
    }
  }
}

/**
 * Step 6: Update source status
 */
async function updateSourceStatus(sourceId: string): Promise<void> {
  console.log("\n✅ Marking source as completed...");

  await markSourceAsCompleted(sourceId, {
    textChunks: stats.textChunks,
    imageChunks: stats.imageChunks,
  });

  console.log(`✅ Source ${sourceId} marked as completed`);
}

/**
 * Cleanup test data
 */
async function cleanup(sourceId?: string): Promise<void> {
  if (!sourceId) {
    console.log("\n⚠️  No source ID to clean up");
    return;
  }

  console.log("\n🧹 Cleaning up test data...");

  try {
    await deleteSource(sourceId);
    console.log(`✅ Deleted source ${sourceId} and all associated chunks`);
  } catch (error) {
    console.error(`❌ Cleanup failed:`, error);
  }
}

/**
 * Print final statistics
 */
function printStats(): void {
  stats.endTime = Date.now();
  const duration = ((stats.endTime - stats.startTime) / 1000).toFixed(2);

  console.log("\n" + "=".repeat(60));
  console.log("📊 INGESTION TEST RESULTS");
  console.log("=".repeat(60));
  console.log(`Status: ${stats.success ? "✅ SUCCESS" : "❌ FAILED"}`);
  console.log(`Duration: ${duration}s`);
  console.log("\nData Processed:");
  console.log(`  - Text chunks: ${stats.textChunks}`);
  console.log(`  - Text embeddings: ${stats.textEmbeddings}`);
  console.log(`  - Image chunks: ${stats.imageChunks}`);
  console.log(`  - Image embeddings: ${stats.imageEmbeddings}`);
  console.log("\nVector Search:");
  console.log(`  - Text search results: ${stats.searchResultsText}`);
  console.log(`  - Image search results: ${stats.searchResultsImage}`);

  if (stats.error) {
    console.log("\nError:");
    console.log(`  ${stats.error}`);
  }

  console.log("=".repeat(60));
}

/**
 * Main test function
 */
async function main() {
  console.log("🚀 Starting end-to-end ingestion pipeline test...");
  console.log("=".repeat(60));

  try {
    // Step 1: Scrape page
    const { title, content, imageUrls } = await scrapePage(TEST_URL);

    // Step 2: Register source and chunk content
    const { sourceId, chunks } = await registerAndChunkSource(
      TEST_URL,
      title,
      content
    );
    stats.sourceId = sourceId;

    // Step 3: Generate text embeddings
    await processTextChunks(sourceId, chunks);

    // Step 4: Process one image (if available)
    if (imageUrls.length > 0) {
      await processImage(sourceId, imageUrls[0]);
    } else {
      console.log("\n⚠️  No images found, skipping image processing");
    }

    // Step 5: Verify vector search
    await verifyVectorSearch(sourceId);

    // Step 6: Update source status
    await updateSourceStatus(sourceId);

    stats.success = true;

    // Cleanup
    await cleanup(sourceId);
  } catch (error) {
    stats.success = false;
    stats.error = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Test failed:", error);

    // Try to cleanup even on error
    if (stats.sourceId) {
      try {
        await markSourceAsFailed(stats.sourceId, stats.error);
        await cleanup(stats.sourceId);
      } catch (cleanupError) {
        console.error("Cleanup also failed:", cleanupError);
      }
    }
  } finally {
    // Print results
    printStats();

    // Close database connection
    await prisma.$disconnect();

    // Exit with appropriate code
    process.exit(stats.success ? 0 : 1);
  }
}

// Run the test
main();
