#!/usr/bin/env tsx
import { Command } from "commander";
import fs from "fs/promises";
import { ExtensionScraper } from "../scrapers/extension-scraper";
import { parseHTML } from "../parsers/html-parser";
import { parsePDF } from "../parsers/pdf-parser";
import { chunkDocument } from "../processing/chunker";
import {
  generateTextEmbeddings,
  generateImageEmbeddings,
  logCosts,
} from "../processing/embedder";
import {
  upsertSources,
  upsertTextChunks,
  upsertImageChunks,
} from "../processing/upserter";
import type {
  SourceUrlConfig,
  ScrapedDocument,
  ParsedContent,
  ChunkData,
  CostTracker,
  ProgressTracker,
} from "../scrapers/types";

interface RunOptions {
  test: boolean;
  limit?: number;
  skipScrape: boolean;
  skipImages: boolean;
  dryRun: boolean;
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
    : "ingestion/sources/phase1-urls.json";

  const urlList: SourceUrlConfig = JSON.parse(
    await fs.readFile(urlFile, "utf-8")
  );

  let totalUrls = urlList.totalUrls;
  if (options.limit) {
    totalUrls = Math.min(totalUrls, options.limit);
    console.log(`⚠️  Limiting to first ${options.limit} URLs\n`);
  }

  console.log(`📦 Target: ${totalUrls} URLs`);
  console.log(`📚 Sources: ${Object.keys(urlList.sources).length}`);
  console.log(`📊 Estimated chunks: ${urlList.estimatedChunks || "N/A"}\n`);

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

  const costTracker: CostTracker = {
    textTokens: 0,
    textCost: 0,
    imageDescriptions: 0,
    imageCost: 0,
    totalCost: 0,
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

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    console.log(
      `[${i + 1}/${documents.length}] Parsing: ${doc.title.slice(0, 60)}...`
    );

    try {
      let parsedContent: ParsedContent;

      if (doc.contentType === "html") {
        parsedContent = parseHTML(doc.content, doc.url);
      } else {
        const buffer = Buffer.from(doc.content, "base64");
        parsedContent = await parsePDF(buffer, doc.url);
      }

      parsed.push({ doc, parsed: parsedContent });
      tracker.documentsParsed++;

      console.log(
        `  ✓ Sections: ${parsedContent.sections.length}, Images: ${parsedContent.metadata.imageCount}, Tables: ${parsedContent.metadata.tableCount}, Words: ${parsedContent.metadata.wordCount}`
      );
    } catch (error) {
      console.error(`  ✗ Failed to parse:`, error);
    }
  }

  console.log(`\n✅ Parsed ${parsed.length} documents`);

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

  const embeddedChunks = await generateTextEmbeddings(
    allChunks,
    costTracker
  );
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
    console.log("\n⚠️  Image processing not yet implemented");
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

  logCosts(costTracker);

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
        costTracker,
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
