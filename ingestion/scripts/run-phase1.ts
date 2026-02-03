#!/usr/bin/env tsx
import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import { ExtensionScraper } from "../scrapers/extension-scraper";
import { parseHTML } from "../parsers/html-parser";
import { parsePDF } from "../parsers/pdf-parser";
import { chunkAgronomyDocument } from "../processing/agronomy-chunker";
import { generateTextEmbeddings, generateImageEmbeddings } from "../processing/embedder";
import { upsertSources, upsertTextChunks, upsertImageChunks } from "../processing/upserter";
import { extractImages, calculateImageStats } from "../processing/image-extractor";
import { validateUrl } from "../processing/url-validator";
import type {
  ScrapedDocument,
  ParsedContent,
  ChunkData,
  ProgressTracker,
  ImageData,
} from "../scrapers/types";
import type { AgronomyFile, AgronomyProblem, AgronomySource } from "../types/agronomy";

interface RunOptions {
  agronomyDir?: string;
  agronomyFile?: string;
  limit?: number;
  skipValidation: boolean;
  skipScrape: boolean;
  skipImages: boolean;
  dryRun: boolean;
}

interface SourceTask {
  file: AgronomyFile;
  problem: AgronomyProblem;
  source: AgronomySource;
}

interface UrlStatusLog {
  crop: string;
  domain: string;
  problem: string;
  url: string;
  authority: "primary" | "supporting";
  reachable: boolean;
  httpCode: number;
  lastChecked: string;
}

/**
 * Detect actual content type from buffer, not URL extension
 */
function detectContentType(buffer: Buffer): "html" | "pdf" | "unknown" {
  if (!buffer || buffer.length < 10) {
    return "unknown";
  }

  const header = buffer.slice(0, 10).toString("ascii");
  if (header.startsWith("%PDF-")) return "pdf";

  const htmlIndicators = ["<!DOCTYPE", "<!doctype", "<html", "<HTML", "<?xml", "<head", "<HEAD"];
  if (htmlIndicators.some((indicator) => header.startsWith(indicator))) return "html";

  const sample = buffer.slice(0, 100).toString("utf8").toLowerCase();
  if (sample.includes("<html") || sample.includes("<!doctype") || sample.includes("<head")) return "html";

  return "unknown";
}

async function loadAgronomyFiles(options: RunOptions): Promise<AgronomyFile[]> {
  if (options.agronomyFile) {
    const raw = await fs.readFile(options.agronomyFile, "utf-8");
    return [JSON.parse(raw) as AgronomyFile];
  }

  const dir = options.agronomyDir || "ingestion/sources/agronomy";
  const entries = await fs.readdir(dir);
  const jsonFiles = entries.filter((f) => f.endsWith(".json"));

  const files: AgronomyFile[] = [];
  for (const file of jsonFiles) {
    const raw = await fs.readFile(path.join(dir, file), "utf-8");
    files.push(JSON.parse(raw) as AgronomyFile);
  }

  return files;
}

function collectSourceTasks(files: AgronomyFile[]): SourceTask[] {
  const tasks: SourceTask[] = [];
  for (const file of files) {
    for (const problem of file.problems) {
      for (const source of problem.sources) {
        tasks.push({ file, problem, source });
      }
    }
  }
  return tasks;
}

async function runPhase1Ingestion(options: RunOptions) {
  const startTime = Date.now();

  console.log("🌱 AI Agronomist Knowledge Base Ingestion - Agronomy JSON");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Dry Run: ${options.dryRun ? "YES (no DB writes)" : "NO"}`);
  console.log(`Skip Validation: ${options.skipValidation ? "YES" : "NO"}`);
  console.log(`Skip Scrape: ${options.skipScrape ? "YES" : "NO"}`);
  console.log(`Skip Images: ${options.skipImages ? "YES" : "NO"}`);
  console.log("");

  const agronomyFiles = await loadAgronomyFiles(options);
  const tasksAll = collectSourceTasks(agronomyFiles);
  const tasks = options.limit ? tasksAll.slice(0, options.limit) : tasksAll;

  console.log(`📦 Agronomy files: ${agronomyFiles.length}`);
  console.log(`📚 Source URLs: ${tasks.length}`);

  const tracker: ProgressTracker = {
    documentsScraped: 0,
    documentsParsed: 0,
    chunksCreated: 0,
    chunksEmbedded: 0,
    imagesProcessed: 0,
    imagesEmbedded: 0,
    costs: { text: 0, images: 0, total: 0 },
  };

  // Step 1: URL Validation (or reuse cached status)
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔎 Step 1: Validating Source URLs");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let urlStatus: UrlStatusLog[] = [];
  const validatedTasks: SourceTask[] = [];

  if (options.skipValidation) {
    try {
      const cached = await fs.readFile("ingestion/state/url-status.json", "utf-8");
      urlStatus = JSON.parse(cached) as UrlStatusLog[];
      const statusByUrl = new Map(urlStatus.map((status) => [status.url, status]));

      for (const task of tasks) {
        const status = statusByUrl.get(task.source.url);
        if (status && !status.reachable) {
          if (task.source.authority === "primary") {
            console.warn(
              `  ⚠️  CRITICAL source previously unreachable: ${task.source.url} (${status.httpCode})`
            );
          } else {
            console.warn(
              `  ⏭️  Skipping previously unreachable source: ${task.source.url} (${status.httpCode})`
            );
          }
          continue;
        }

        if (!status) {
          console.warn(
            `  ⚠️  No cached status for ${task.source.url}; scraping without verification.`
          );
        }

        validatedTasks.push(task);
      }

      console.log(
        `\n✅ URL validation skipped: ${validatedTasks.length}/${tasks.length} queued from cache`
      );
    } catch (error) {
      console.warn(
        "⚠️  Could not read ingestion/state/url-status.json; falling back to live validation."
      );
    }
  }

  if (!options.skipValidation || urlStatus.length === 0) {
    urlStatus = [];
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      console.log(`[${i + 1}/${tasks.length}] HEAD: ${task.source.url}`);

      const status = await validateUrl(task.source.url);
      urlStatus.push({
        crop: task.file.crop,
        domain: task.file.domain,
        problem: task.problem.name,
        url: task.source.url,
        authority: task.source.authority,
        reachable: status.reachable,
        httpCode: status.httpCode,
        lastChecked: status.lastChecked,
      });

      if (!status.reachable) {
        if (task.source.authority === "primary") {
          console.warn(
            `  ⚠️  CRITICAL source unreachable: ${task.source.url} (${status.httpCode})`
          );
        } else {
          console.warn(`  ⏭️  Skipping unreachable source: ${task.source.url} (${status.httpCode})`);
        }
        continue;
      }

      validatedTasks.push(task);
    }

    await fs.mkdir("ingestion/state", { recursive: true });
    await fs.writeFile(
      "ingestion/state/url-status.json",
      JSON.stringify(urlStatus, null, 2)
    );

    console.log(`\n✅ URL validation complete: ${validatedTasks.length}/${tasks.length} reachable`);
  }

  // Step 2: Scraping
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📥 Step 2: Scraping Documents");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let documents: ScrapedDocument[] = [];

  if (!options.skipScrape) {
    const scraper = new ExtensionScraper();

    try {
      for (let i = 0; i < validatedTasks.length; i++) {
        const task = validatedTasks[i];
        console.log(`[${i + 1}/${validatedTasks.length}] Scraping: ${task.source.url}`);

        try {
          const doc = await scraper.scrape(task.source.url);
          doc.metadata = {
            institution: task.source.institution,
            crops: [task.file.crop, ...task.file.cropAliases],
            topics: [task.file.domain, task.problem.name],
            region: task.file.region.macro,
            crop: task.file.crop,
            cropAliases: task.file.cropAliases,
            domain: task.file.domain,
            problemName: task.problem.name,
            problemScientificName: task.problem.scientificName,
            regionMacro: task.file.region.macro,
            regionStates: task.file.region.states,
            regionProvinces: task.file.region.provinces,
            regulatoryAuthority: task.file.region.regulatoryAuthority,
            sourcePublicationId: task.source.publicationId,
            sourceAuthority: task.source.authority,
          };

          documents.push(doc);
          tracker.documentsScraped++;
        } catch (error) {
          console.error(`  ✗ Failed to scrape: ${task.source.url}`, error);
        }
      }

      const cachePath = "ingestion/state/agronomy-scraped-documents.json";

      try {
        await fs.writeFile(cachePath, JSON.stringify(documents, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof RangeError || message.includes("Invalid string length")) {
          console.warn(
            `⚠️  Cache write failed (${message}). Falling back to per-document serialization.`
          );

          let skipped = 0;
          const serialized: string[] = [];

          for (const doc of documents) {
            try {
              serialized.push(JSON.stringify(doc));
            } catch (docError) {
              skipped++;
              console.error(`  ✗ Skipping document cache for ${doc.url}`, docError);
            }
          }

          try {
            await fs.writeFile(cachePath, `[\n${serialized.join(",\n")}\n]\n`);
            if (skipped > 0) {
              console.warn(`⚠️  Skipped ${skipped} document(s) in cache due to size.`);
            }
          } catch (fallbackError) {
            console.error("❌ Failed to write cache even in fallback mode:", fallbackError);
          }
        } else {
          console.error("❌ Failed to write cache:", error);
        }
      }

      console.log(`\n✅ Scraped ${documents.length} documents (saved to state/agronomy-scraped-documents.json)`);
    } finally {
      await scraper.close();
    }
  } else {
    console.log("⏭️  Skipping scrape, loading from cache...");
    const cached = await fs.readFile(
      "ingestion/state/agronomy-scraped-documents.json",
      "utf-8"
    );
    documents = JSON.parse(cached);
    tracker.documentsScraped = documents.length;
    console.log(`✅ Loaded ${documents.length} cached documents`);
  }

  // Step 3: Create Source records
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📚 Step 3: Creating Source Records");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let sourceIdMap: Map<string, string> = new Map();

  if (!options.dryRun) {
    sourceIdMap = await upsertSources(documents);
  } else {
    console.log(`🔍 [DRY RUN] Would create ${documents.length} sources`);
    documents.forEach((doc, i) => {
      sourceIdMap.set(doc.url, `mock-source-${i}`);
    });
  }

  // Step 4: Parsing
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📄 Step 4: Parsing Documents");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const parsed: Array<{ doc: ScrapedDocument; parsed: ParsedContent }> = [];
  const failedDocs: Array<{ url: string; title: string; error: string }> = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    console.log(`[${i + 1}/${documents.length}] Parsing: ${doc.title.slice(0, 60)}...`);

    try {
      let parsedContent: ParsedContent;

      if (doc.contentType === "html") {
        parsedContent = parseHTML(doc.content, doc.url);
      } else {
        const buffer = Buffer.from(doc.content, "base64");
        const actualType = detectContentType(buffer);

        if (actualType === "pdf") {
          parsedContent = await parsePDF(buffer, doc.url);
        } else if (actualType === "html") {
          console.log("   ⚠️  URL ends in .pdf but content is HTML - parsing as HTML");
          parsedContent = parseHTML(buffer.toString("utf8"), doc.url);
        } else {
          console.log("   ⚠️  Unknown content type, attempting HTML parse");
          parsedContent = parseHTML(buffer.toString("utf8"), doc.url);
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

  if (failedDocs.length > 0) {
    await fs.writeFile(
      "ingestion/state/agronomy-failed-docs.json",
      JSON.stringify(failedDocs, null, 2)
    );
  }

  console.log(`\n✅ Parsed ${parsed.length} documents`);

  // Step 5: Chunking
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✂️  Step 5: Agronomic Chunking");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const allChunks: ChunkData[] = [];

  for (const { doc, parsed: parsedContent } of parsed) {
    const sourceId = sourceIdMap.get(doc.url);
    if (!sourceId) continue;

    const baseMeta = {
      crop: doc.metadata.crop,
      cropAliases: doc.metadata.cropAliases,
      regionMacro: doc.metadata.regionMacro,
      regionStates: doc.metadata.regionStates,
      regionProvinces: doc.metadata.regionProvinces,
      domain: doc.metadata.domain,
      problemName: doc.metadata.problemName,
      problemScientificName: doc.metadata.problemScientificName,
      sourceInstitution: doc.metadata.institution,
      sourcePublicationId: doc.metadata.sourcePublicationId || null,
      sourceUrl: doc.url,
      regulatoryAuthority: doc.metadata.regulatoryAuthority,
    };

    const chunks = chunkAgronomyDocument(parsedContent, sourceId, baseMeta);
    allChunks.push(...chunks);

    console.log(
      `  ${doc.title.slice(0, 50)}: ${chunks.length} chunks (${chunks.reduce((sum, c) => sum + c.tokenCount, 0)} tokens)`
    );
  }

  tracker.chunksCreated = allChunks.length;

  console.log(`\n✅ Created ${allChunks.length} text chunks`);

  // Step 6: Generate text embeddings
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔢 Step 6: Generating Text Embeddings");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const embeddedChunks = await generateTextEmbeddings(allChunks);
  tracker.chunksEmbedded = embeddedChunks.length;

  // Step 7: Upsert text chunks
  if (!options.dryRun) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💾 Step 7: Upserting Text Chunks to Database");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const result = await upsertTextChunks(embeddedChunks);

    console.log(`\n✅ Database upsert complete:`);
    console.log(`   Inserted: ${result.inserted}`);
    console.log(`   Skipped (duplicates): ${result.skipped}`);
  } else {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💾 Step 7: Text Chunk Upsert");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log(`🔍 [DRY RUN] Would insert ${embeddedChunks.length} text chunks`);
  }

  // Step 8: Image processing
  if (!options.skipImages) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🖼️  Step 8: Extracting Images");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const allImages: ImageData[] = [];

    for (const { doc, parsed: parsedContent } of parsed) {
      const sourceId = sourceIdMap.get(doc.url);
      if (!sourceId) continue;

      const imageMeta = {
        crop: doc.metadata.crop,
        cropAliases: doc.metadata.cropAliases,
        regionMacro: doc.metadata.regionMacro,
        regionStates: doc.metadata.regionStates,
        regionProvinces: doc.metadata.regionProvinces,
        domain: doc.metadata.domain,
        problemName: doc.metadata.problemName,
        problemScientificName: doc.metadata.problemScientificName,
        sourceInstitution: doc.metadata.institution,
        sourcePublicationId: doc.metadata.sourcePublicationId || null,
        sourceUrl: doc.url,
        regulatoryAuthority: doc.metadata.regulatoryAuthority,
      };

      const images = extractImages(parsedContent, sourceId, imageMeta);
      allImages.push(...images);

      if (images.length > 0) {
        console.log(`  ${doc.title.slice(0, 50)}: ${images.length} images`);
      }
    }

    tracker.imagesProcessed = allImages.length;

    console.log(`\n✅ Extracted ${allImages.length} images`);

    if (allImages.length > 0) {
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

      console.log(`   With alt text: ${stats.avgAltTextLength > 0 ? allImages.filter((i) => i.altText).length : 0}`);
      console.log(`   With captions: ${stats.imagesWithCaptions}`);
      console.log(`   With context: ${stats.imagesWithContext}`);

      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔢 Step 9: Generating Image Embeddings");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      const embeddedImages = await generateImageEmbeddings(allImages);
      tracker.imagesEmbedded = embeddedImages.length;

      if (!options.dryRun) {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("💾 Step 10: Upserting Images to Database");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        const imageResult = await upsertImageChunks(embeddedImages);

        console.log(`\n✅ Image database upsert complete:`);
        console.log(`   Inserted: ${imageResult.inserted}`);
        console.log(`   Updated: ${imageResult.updated}`);
        console.log(`   Skipped: ${imageResult.skipped}`);
      } else {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("💾 Step 10: Image Database Upsert");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        console.log(`🔍 [DRY RUN] Would insert ${embeddedImages.length} image chunks`);
      }
    } else {
      console.log("\n⚠️  No images found in parsed documents");
    }
  }

  const elapsed = Date.now() - startTime;
  const elapsedMin = Math.floor(elapsed / 60000);
  const elapsedSec = Math.floor((elapsed % 60000) / 1000);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 Agronomy JSON Ingestion Complete!");
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

  await fs.writeFile(
    "ingestion/state/agronomy-progress.json",
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

  console.log("💾 Progress saved to ingestion/state/agronomy-progress.json\n");

  if (options.dryRun) {
    console.log("⚠️  DRY RUN MODE - No data was written to the database");
    console.log("   Run without --dry-run to write to database\n");
  }
}

const program = new Command();

program
  .name("run-phase1")
  .description("Run agronomy-first knowledge base ingestion")
  .option("--agronomy-dir <dir>", "Directory with agronomy JSON files", "ingestion/sources/agronomy")
  .option("--agronomy-file <path>", "Process a single agronomy JSON file")
  .option("--limit <number>", "Limit number of source URLs to process", parseInt)
  .option("--skip-validation", "Skip URL validation and reuse cached status", false)
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
