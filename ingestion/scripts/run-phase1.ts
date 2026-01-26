#!/usr/bin/env tsx
import { Command } from "commander";
import fs from "fs/promises";
import { ExtensionScraper } from "../scrapers/extension-scraper";
import { parseHTML } from "../parsers/html-parser";
import { parsePDF } from "../parsers/pdf-parser";
import { chunkDocument } from "../processing/chunker";
import { generateTextEmbeddings } from "../processing/embedder";
import { upsertSources, upsertTextChunks } from "../processing/upserter";
import { extractImages, calculateImageStats } from "../processing/image-extractor";
import { generateImageEmbeddings } from "../processing/embedder";
import { upsertImageChunks } from "../processing/upserter";
import type {
  SourceUrlConfig,
  ScrapedDocument,
  ParsedContent,
  ChunkData,
  ProgressTracker,
  ImageData,
} from "../scrapers/types";

interface RunOptions {
  test: boolean;
  limit?: number;
  skipScrape: boolean;
  skipImages: boolean;
  dryRun: boolean;
}

/**
 * Detect actual content type from buffer, not URL extension
 * Prevents misclassifying HTML error pages as PDFs
 */
function detectContentType(buffer: Buffer, url: string): 'html' | 'pdf' | 'unknown' {
  if (!buffer || buffer.length < 10) {
    return 'unknown';
  }

  // Check magic bytes (first few bytes)
  const header = buffer.slice(0, 10).toString('ascii');
  
  // PDF magic bytes: %PDF-
  if (header.startsWith('%PDF-')) {
    return 'pdf';
  }
  
  // HTML indicators
  const htmlIndicators = ['<!DOCTYPE', '<!doctype', '<html', '<HTML', '<?xml', '<head', '<HEAD'];
  if (htmlIndicators.some(indicator => header.startsWith(indicator))) {
    return 'html';
  }
  
  // Check first 100 bytes for HTML tags
  const sample = buffer.slice(0, 100).toString('utf8').toLowerCase();
  if (sample.includes('<html') || sample.includes('<!doctype') || sample.includes('<head')) {
    return 'html';
  }
  
  return 'unknown';
}

/**
 * Calculate total URLs from SourceUrlConfig
 */
function countTotalUrls(urlList: SourceUrlConfig): number {
  let total = 0;
  for (const sourceKey of Object.keys(urlList.sources)) {
    total += urlList.sources[sourceKey].urls.length;
  }
  return total;
}

/**
 * Calculate estimated chunks from SourceUrlConfig
 */
function estimateChunks(urlList: SourceUrlConfig): number {
  let total = 0;
  for (const sourceKey of Object.keys(urlList.sources)) {
    for (const url of urlList.sources[sourceKey].urls) {
      total += url.expectedChunks || 25; // Default 25 chunks per doc
    }
  }
  return total;
}

async function runPhase1Ingestion(options: RunOptions) {
  const startTime = Date.now();

  console.log("🌱 AI Agronomist Knowledge Base Ingestion - Phase 1");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    `Mode: ${options.test ? "TEST (10 URLs)" : "FULL (187 URLs)"}`
  );
  console.log(`Dry Run: ${options.dryRun ? "YES (no DB writes)" : "NO"}`);
  console.log(`Skip Scrape: ${options.skipScrape ? "YES" : "NO"}`);
  console.log(`Skip Images: ${options.skipImages ? "YES" : "NO"}`);
  console.log("");

  // Load URL list
  const urlFile = options.test
    ? "ingestion/sources/test-urls.json"
    : "ingestion/sources/phase3-urls.json";

  const urlList: SourceUrlConfig = JSON.parse(
    await fs.readFile(urlFile, "utf-8")
  );

  let totalUrls = countTotalUrls(urlList);
  const estimatedChunks = estimateChunks(urlList);
  
  if (options.limit) {
    totalUrls = Math.min(totalUrls, options.limit);
    console.log(`⚠️  Limiting to first ${options.limit} URLs\n`);
  }

  console.log(`📦 Target: ${totalUrls} URLs`);
  console.log(`📚 Sources: ${Object.keys(urlList.sources).length}`);
  console.log(`📊 Estimated chunks: ${estimatedChunks}\n`);

  // Initialize trackers
  const tracker: ProgressTracker = {
    documentsScraped: 0,
    documentsParsed: 0,
    chunksCreated: 0,
    chunksEmbedded: 0,
    imagesProcessed: 0,
    imagesEmbedded: 0,
    costs: { text: 0, images: 0, total: 0 },
  };

  // Step 1: Scraping
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📥 Step 1: Scraping Documents");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let documents: ScrapedDocument[] = [];

  if (!options.skipScrape) {
    const scraper = new ExtensionScraper();

    try {
      documents = await scraper.scrapeFromUrlList(urlList, 1);
      tracker.documentsScraped = documents.length;

      // Save scraped documents for resume
      await fs.mkdir("ingestion/state", { recursive: true });
      await fs.writeFile(
        "ingestion/state/scraped-documents.json",
        JSON.stringify(documents, null, 2)
      );

      console.log(
        `\n✅ Scraped ${documents.length} documents (saved to state/scraped-documents.json)`
      );
    } finally {
      await scraper.close();
    }
  } else {
    console.log("⏭️  Skipping scrape, loading from cache...");
    const cached = await fs.readFile(
      "ingestion/state/scraped-documents.json",
      "utf-8"
    );
    documents = JSON.parse(cached);
    tracker.documentsScraped = documents.length;
    console.log(`✅ Loaded ${documents.length} cached documents`);
  }

  // Apply limit if specified
  if (options.limit) {
    documents = documents.slice(0, options.limit);
  }

  // DEBUG: Check scraped content for images
  console.log('\n🔍 DEBUG: Checking scraped documents for <img> tags...');
  if (documents.length > 0) {
    const firstDoc = documents[0];
    console.log(`   First doc title: ${firstDoc.title}`);
    console.log(`   Content type: ${firstDoc.contentType}`);
    console.log(`   Content length: ${firstDoc.content.length} chars`);
    
    // Check for <img tags in HTML
    if (firstDoc.contentType === 'html') {
      const imgMatches = firstDoc.content.match(/<img/gi);
      console.log(`   Contains <img tags: ${imgMatches ? imgMatches.length : 0}`);
      
      if (imgMatches && imgMatches.length > 0) {
        // Show first image tag
        const imgTagRegex = /<img[^>]+>/gi;
        const imgTags = firstDoc.content.match(imgTagRegex);
        if (imgTags && imgTags.length > 0) {
          console.log(`   First image tag preview: ${imgTags[0].slice(0, 150)}...`);
        }
      }
    }
  }

  // Step 2: Create Source records
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📚 Step 2: Creating Source Records");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let sourceIdMap: Map<string, string> = new Map();

  if (!options.dryRun) {
    sourceIdMap = await upsertSources(documents);
  } else {
    console.log(`🔍 [DRY RUN] Would create ${documents.length} sources`);
    // Create mock IDs for dry run
    documents.forEach((doc, i) => {
      sourceIdMap.set(doc.url, `mock-source-${i}`);
    });
  }

  // Step 3: Parsing
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📄 Step 3: Parsing Documents");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const parsed: Array<{ doc: ScrapedDocument; parsed: ParsedContent }> = [];
  const failedDocs: Array<{ url: string; title: string; error: string }> = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    console.log(
      `[${i + 1}/${documents.length}] Parsing: ${doc.title.slice(0, 60)}...`
    );

    try {
      let parsedContent: ParsedContent;

      // CRITICAL: Detect actual content type from buffer, not URL
      if (doc.contentType === "html") {
        // Already marked as HTML by scraper
        parsedContent = parseHTML(doc.content, doc.url);
      } else {
        // For "pdf" or unknown, check actual content
        const buffer = Buffer.from(doc.content, "base64");
        const actualType = detectContentType(buffer, doc.url);
        
        if (actualType === 'pdf') {
          parsedContent = await parsePDF(buffer, doc.url);
        } else if (actualType === 'html') {
          console.log('   ⚠️  URL ends in .pdf but content is HTML - parsing as HTML');
          // Decode buffer back to string for HTML parser
          parsedContent = parseHTML(buffer.toString('utf8'), doc.url);
        } else {
          // Unknown type - try HTML first (most common fallback)
          console.log('   ⚠️  Unknown content type, attempting HTML parse');
          parsedContent = parseHTML(buffer.toString('utf8'), doc.url);
        }
      }

      parsed.push({ doc, parsed: parsedContent });
      tracker.documentsParsed++;

      console.log(
        `  ✓ Sections: ${parsedContent.sections.length}, Images: ${parsedContent.metadata.imageCount}, Tables: ${parsedContent.metadata.tableCount}, Words: ${parsedContent.metadata.wordCount}`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ Failed to parse: ${errorMsg}`);
      
      failedDocs.push({
        url: doc.url,
        title: doc.title,
        error: errorMsg,
      });
    }
  }

  console.log(`\n✅ Parsed ${parsed.length} documents`);
  
  if (failedDocs.length > 0) {
    console.log(`⚠️  ${failedDocs.length} documents failed to parse`);
    await fs.writeFile(
      'ingestion/state/failed-docs.json',
      JSON.stringify(failedDocs, null, 2)
    );
  }

  // DEBUG: Check parsed content for images
  console.log('\n🔍 DEBUG: Checking parsed documents for images...');
  console.log(`   Total parsed documents: ${parsed.length}`);
  if (parsed.length > 0) {
    const { doc, parsed: parsedContent } = parsed[0];
    console.log(`   First doc title: ${parsedContent.title}`);
    console.log(`   First doc sections: ${parsedContent.sections.length}`);
    
    parsedContent.sections.forEach((section, idx) => {
      console.log(`   Section ${idx}: ${section.heading || 'No heading'}`);
      console.log(`     - Text length: ${section.text.length} chars`);
      console.log(`     - Images in section: ${section.images.length}`);
      
      if (section.images.length > 0) {
        section.images.forEach((img, imgIdx) => {
          console.log(`       Image ${imgIdx}: ${img.url.slice(0, 80)}...`);
          console.log(`         - Alt: ${img.alt || 'none'}`);
          console.log(`         - Caption: ${img.caption || 'none'}`);
        });
      }
    });
  }

  // Step 4: Chunking
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✂️  Step 4: Chunking Text");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const allChunks: ChunkData[] = [];

  for (const { doc, parsed: parsedContent } of parsed) {
    const sourceId = sourceIdMap.get(doc.url);
    if (!sourceId) continue;

    // Create mock source object for chunker
    const source = {
      id: sourceId,
      title: doc.title,
      url: doc.url,
      sourceType: doc.sourceType,
      institution: doc.metadata.institution || null,
      status: "processed",
      chunksCount: 0,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: doc.metadata,
    };

    const chunks = chunkDocument(parsedContent, source as any);
    allChunks.push(...chunks);

    console.log(
      `  ${doc.title.slice(0, 50)}: ${chunks.length} chunks (${chunks.reduce((sum, c) => sum + c.tokenCount, 0)} tokens)`
    );
  }

  tracker.chunksCreated = allChunks.length;

  console.log(`\n✅ Created ${allChunks.length} text chunks`);
  console.log(
    `   Total tokens: ${allChunks.reduce((sum, c) => sum + c.tokenCount, 0).toLocaleString()}`
  );
  console.log(
    `   Avg chunk size: ${Math.round(allChunks.reduce((sum, c) => sum + c.tokenCount, 0) / allChunks.length)} tokens`
  );

  // Step 5: Generate embeddings
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔢 Step 5: Generating Text Embeddings");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // NEW: embedder now returns ChunkData & { embedding } directly!
  const embeddedChunks = await generateTextEmbeddings(allChunks);
  
  tracker.chunksEmbedded = embeddedChunks.length;

  // Step 6: Upsert to database
  if (!options.dryRun) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💾 Step 6: Upserting to Database");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const result = await upsertTextChunks(embeddedChunks);

    console.log(`\n✅ Database upsert complete:`);
    console.log(`   Inserted: ${result.inserted}`);
    console.log(`   Skipped (duplicates): ${result.skipped}`);
  } else {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💾 Step 6: Database Upsert");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log(
      `🔍 [DRY RUN] Would insert ${embeddedChunks.length} text chunks`
    );
  }

  // Step 7: Image processing (skipped for test)
  if (!options.skipImages) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🖼️  Step 7: Extracting Images");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const allImages: ImageData[] = [];

    for (const { doc, parsed: parsedContent } of parsed) {
      const sourceId = sourceIdMap.get(doc.url);
      if (!sourceId) continue;

      const images = extractImages(parsedContent, sourceId);
      allImages.push(...images);

      if (images.length > 0) {
        console.log(
          `  ${doc.title.slice(0, 50)}: ${images.length} images`
        );
      }
    }

    tracker.imagesProcessed = allImages.length;

    console.log(`\n✅ Extracted ${allImages.length} images`);

    if (allImages.length > 0) {
      // Show image stats
      const stats = calculateImageStats(allImages);
      console.log(`\n📊 Image Statistics:`);
      console.log(`   By category:`);
      Object.entries(stats.byCategory).forEach(([cat, count]) => {
        console.log(`      ${cat}: ${count}`);
      });
      
      if (Object.keys(stats.byCrop).length > 0) {
        console.log(`   By crop:`);
        Object.entries(stats.byCrop).forEach(([crop, count]) => {
          console.log(`      ${crop}: ${count}`);
        });
      }
      
      console.log(`   With alt text: ${stats.avgAltTextLength > 0 ? allImages.filter(i => i.altText).length : 0}`);
      console.log(`   With captions: ${stats.imagesWithCaptions}`);
      console.log(`   With context: ${stats.imagesWithContext}`);

      // Step 8: Generate Image Embeddings
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔢 Step 8: Generating Image Embeddings");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      const embeddedImages = await generateImageEmbeddings(allImages);
      tracker.imagesEmbedded = embeddedImages.length;

      // Step 9: Upsert Images to Database
      if (!options.dryRun) {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("💾 Step 9: Upserting Images to Database");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        const imageResult = await upsertImageChunks(embeddedImages);

        console.log(`\n✅ Image database upsert complete:`);
        console.log(`   Inserted: ${imageResult.inserted}`);
        console.log(`   Updated: ${imageResult.updated}`);
        console.log(`   Skipped: ${imageResult.skipped}`);
      } else {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("💾 Step 9: Image Database Upsert");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        console.log(
          `🔍 [DRY RUN] Would insert ${embeddedImages.length} image chunks`
        );
      }
    } else {
      console.log("\n⚠️  No images found in parsed documents");
    }
  }

  // Final report
  const elapsed = Date.now() - startTime;
  const elapsedMin = Math.floor(elapsed / 60000);
  const elapsedSec = Math.floor((elapsed % 60000) / 1000);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 Phase 1 Ingestion Complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("📊 Summary:");
  console.log(`   Documents scraped: ${tracker.documentsScraped}`);
  console.log(`   Documents parsed: ${tracker.documentsParsed}`);
  console.log(`   Text chunks created: ${tracker.chunksCreated}`);
  console.log(`   Text chunks embedded: ${tracker.chunksEmbedded}`);
  console.log(`   Images processed: ${tracker.imagesProcessed}`);
  console.log("");

  console.log(`\n⏱️  Total time: ${elapsedMin}m ${elapsedSec}s`);
  console.log("");

  // Save progress
  await fs.writeFile(
    "ingestion/state/progress.json",
    JSON.stringify(
      {
        phase: 1,
        completedAt: new Date().toISOString(),
        tracker,
        elapsed,
      },
      null,
      2
    )
  );

  console.log("💾 Progress saved to ingestion/state/progress.json\n");

  if (options.dryRun) {
    console.log(
      "⚠️  DRY RUN MODE - No data was written to the database"
    );
    console.log("   Run without --dry-run to write to database\n");
  }
}

// CLI setup
const program = new Command();

program
  .name("run-phase1")
  .description("Run Phase 1 knowledge base ingestion")
  .option("--test", "Use test-urls.json (10 URLs) instead of full phase1", false)
  .option("--limit <number>", "Limit number of URLs to process", parseInt)
  .option("--skip-scrape", "Skip scraping, use cached documents", false)
  .option("--skip-images", "Skip image processing", false)
  .option("--dry-run", "Don't write to database (validation only)", false)
  .action(async (options: RunOptions) => {
    try {
      await runPhase1Ingestion(options);
    } catch (error) {
      console.error("\n❌ Fatal error:", error);
      process.exit(1);
    }
  });

program.parse();