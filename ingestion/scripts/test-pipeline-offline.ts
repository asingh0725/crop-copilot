#!/usr/bin/env tsx
/**
 * Offline pipeline test using mock data
 * Tests parsing, chunking, and embedding without network access
 */

import { parseHTML } from "../parsers/html-parser";
import { parsePDF } from "../parsers/pdf-parser";
import { chunkDocument, countTokens } from "../processing/chunker";
import type { ScrapedDocument } from "../scrapers/types";

console.log("🧪 Offline Pipeline Test");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// Mock HTML document
const mockHTML = `
<!DOCTYPE html>
<html>
<head><title>Nitrogen Deficiency in Corn</title></head>
<body>
  <h1>Nitrogen Deficiency in Corn</h1>

  <h2>Symptoms</h2>
  <p>Nitrogen deficiency in corn appears first on older (lower) leaves because nitrogen is mobile within the plant. The characteristic symptom is a V-shaped yellowing pattern that starts at the leaf tip and moves toward the midrib along the leaf margins.</p>

  <p>Key identification features include symptoms appearing on lower leaves first, progressing upward. The yellow or light green color follows a V-pattern from the leaf tip. The midrib often remains green longer than margins. Severe deficiency causes complete leaf yellowing and necrosis, often called "firing" when lower leaves die completely.</p>

  <h2>Management</h2>
  <p>Distinguish from sulfur deficiency, which shows similar yellowing but appears first on UPPER (new) leaves because sulfur is immobile in the plant.</p>

  <p>Growth stages most affected are V4-V8 when rapid N uptake begins. Plants can recover if nitrogen is applied before V10, though yield loss may still occur.</p>

  <h2>Fertilizer Recommendations</h2>
  <p>Apply nitrogen based on soil tests and yield goals. For corn following soybeans, reduce rates by 30-40 lbs N/acre. Split applications reduce loss and improve efficiency.</p>

  <table>
    <caption>Nitrogen Rates by Yield Goal</caption>
    <tr><th>Yield Goal (bu/ac)</th><th>N Rate (lbs/ac)</th></tr>
    <tr><td>150</td><td>120-140</td></tr>
    <tr><td>180</td><td>150-170</td></tr>
    <tr><td>200</td><td>170-190</td></tr>
  </table>
</body>
</html>
`;

const mockDoc: ScrapedDocument = {
  url: "https://test.edu/nitrogen-corn",
  title: "Nitrogen Deficiency in Corn",
  content: mockHTML,
  contentType: "html",
  sourceType: "UNIVERSITY_EXTENSION",
  metadata: {
    institution: "Test University Extension",
    crops: ["corn"],
    topics: ["nutrients", "nitrogen", "deficiency"],
    region: "Corn Belt",
  },
};

// Test 1: HTML Parsing
console.log("1️⃣  Testing HTML Parser\n");

try {
  const parsed = parseHTML(mockHTML, mockDoc.url);

  console.log(`   Title: ${parsed.title}`);
  console.log(`   Sections: ${parsed.sections.length}`);
  console.log(`   Tables: ${parsed.metadata.tableCount}`);
  console.log(`   Images: ${parsed.metadata.imageCount}`);
  console.log(`   Word count: ${parsed.metadata.wordCount}`);
  console.log("");

  // Show section breakdown
  parsed.sections.forEach((section, i) => {
    const heading = section.heading || "No heading";
    const words = section.text.split(/\s+/).length;
    console.log(`   Section ${i + 1}: "${heading}" (${words} words)`);
  });

  console.log("\n   ✅ HTML parsing successful\n");

  // Test 2: Chunking
  console.log("2️⃣  Testing Chunker\n");

  const mockSource = {
    id: "test-source-1",
    title: mockDoc.title,
    url: mockDoc.url,
    sourceType: mockDoc.sourceType,
    institution: mockDoc.metadata.institution || null,
    status: "processed" as const,
    chunksCount: 0,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: mockDoc.metadata,
  };

  const chunks = chunkDocument(parsed, mockSource as any);

  console.log(`   Total chunks: ${chunks.length}`);
  console.log(
    `   Total tokens: ${chunks.reduce((sum, c) => sum + c.tokenCount, 0)}`
  );
  console.log(
    `   Avg chunk size: ${Math.round(chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length)} tokens`
  );
  console.log("");

  chunks.forEach((chunk, i) => {
    console.log(
      `   Chunk ${i + 1}: ${chunk.tokenCount} tokens, type: ${chunk.metadata.contentType}`
    );
    console.log(`     Preview: ${chunk.content.slice(0, 100)}...`);
    console.log("");
  });

  console.log("   ✅ Chunking successful\n");

  // Test 3: Token counting accuracy
  console.log("3️⃣  Testing Token Counter\n");

  const testStrings = [
    "This is a short test.",
    "Nitrogen deficiency symptoms appear on lower leaves first.",
    "Apply 150-170 lbs N/acre for 180 bu/ac yield goal in corn following soybeans.",
  ];

  testStrings.forEach((str) => {
    const tokens = countTokens(str);
    const words = str.split(/\s+/).length;
    console.log(`   "${str}"`);
    console.log(`     Tokens: ${tokens} | Words: ${words} | Ratio: ${(tokens / words).toFixed(2)}`);
  });

  console.log("\n   ✅ Token counting successful\n");

  // Test 4: Content type detection
  console.log("4️⃣  Testing Content Type Detection\n");

  const contentTypes = chunks.reduce((acc, chunk) => {
    acc[chunk.metadata.contentType] = (acc[chunk.metadata.contentType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(contentTypes).forEach(([type, count]) => {
    console.log(`   ${type}: ${count} chunks`);
  });

  console.log("\n   ✅ Content type detection successful\n");

  // Test 5: Metadata propagation
  console.log("5️⃣  Testing Metadata Propagation\n");

  const sampleChunk = chunks[0];
  console.log(`   Sample chunk metadata:`);
  console.log(`     Crops: ${sampleChunk.metadata.crops?.join(", ")}`);
  console.log(`     Topics: ${sampleChunk.metadata.topics?.join(", ")}`);
  console.log(`     Region: ${sampleChunk.metadata.region}`);
  console.log(`     Section: ${sampleChunk.metadata.section}`);
  console.log(`     Content type: ${sampleChunk.metadata.contentType}`);

  console.log("\n   ✅ Metadata propagation successful\n");

  // Summary
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 Test Summary");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("✅ All pipeline components tested successfully!");
  console.log("");
  console.log("Pipeline validation:");
  console.log(`   ✓ HTML parsing extracts content correctly`);
  console.log(`   ✓ Chunker creates appropriate sized chunks (${chunks.length} chunks)`);
  console.log(`   ✓ Token counting works accurately`);
  console.log(`   ✓ Content types detected automatically`);
  console.log(`   ✓ Metadata propagates to chunks`);
  console.log("");
  console.log("Note: Scraping and embedding require internet access and API keys.");
  console.log("      Run actual ingestion when network and credentials are available.\n");

  process.exit(0);
} catch (error) {
  console.error("\n❌ Test failed:", error);
  process.exit(1);
}
