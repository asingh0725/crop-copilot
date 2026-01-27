import { encoding_for_model } from "tiktoken";
import type { ParsedContent, ChunkData } from "../scrapers/types";
import type { Source } from "@prisma/client";

// Initialize tiktoken encoder for OpenAI embeddings model
const enc = encoding_for_model("text-embedding-3-small");

/**
 * Chunk size targets by content type (in tokens)
 */
const CHUNK_SIZE_TARGETS = {
  symptom: { min: 200, max: 400 },
  treatment: { min: 300, max: 600 },
  product: { min: 200, max: 400 },
  procedure: { min: 400, max: 800 },
  background: { min: 500, max: 1000 },
  table: { min: 0, max: Infinity }, // Preserve whole tables
};

const DEFAULT_TARGET = { min: 400, max: 800 };
const OVERLAP_TOKENS = 75; // 50-100 token overlap
const MAX_TOKENS = 1024; // Absolute maximum per chunk

/**
 * Count tokens in text
 */
export function countTokens(text: string): number {
  try {
    return enc.encode(text).length;
  } catch (error) {
    // Fallback to rough estimation if encoding fails
    console.warn("Token encoding failed, using estimation");
    return Math.ceil(text.length / 4); // Rough approximation
  }
}

/**
 * Chunk a parsed document into semantic chunks with token limits
 */
export function chunkDocument(
  parsed: ParsedContent,
  source: Source,
  contentType: ChunkData["metadata"]["contentType"] = "background"
): ChunkData[] {
  const chunks: ChunkData[] = [];
  let globalChunkIndex = 0;

  // Extract metadata from source
  const sourceMetadata =
    typeof source.metadata === "object" && source.metadata !== null
      ? (source.metadata as Record<string, any>)
      : {};

  const baseMeta = {
    crops: sourceMetadata.crops || [],
    topics: sourceMetadata.topics || [],
    region: sourceMetadata.region,
  };

  // Process each section
  for (const section of parsed.sections) {
    const sectionHeading = section.heading || "General";

    // Determine content type from section heading
    const detectedType = detectContentType(sectionHeading, section.text);
    const chunkType = detectedType || contentType;

    // Chunk the section text
    const sectionChunks = chunkText(
      section.text,
      sectionHeading,
      chunkType
    );

    // Create chunk data objects
    for (const textChunk of sectionChunks) {
      const tokenCount = countTokens(textChunk);

      chunks.push({
        content: textChunk,
        sourceId: source.id,
        chunkIndex: globalChunkIndex++,
        tokenCount,
        metadata: {
          ...baseMeta,
          section: sectionHeading,
          heading: sectionHeading,
          contentType: chunkType,
        },
      });
    }
  }

  // Process tables separately (keep whole)
  for (const table of parsed.tables) {
    const tableText = formatTable(table);
    const tokenCount = countTokens(tableText);

    chunks.push({
      content: tableText,
      sourceId: source.id,
      chunkIndex: globalChunkIndex++,
      tokenCount,
      metadata: {
        ...baseMeta,
        section: table.heading || "Table",
        heading: table.heading,
        contentType: "table",
      },
    });
  }

  return chunks;
}

/**
 * Chunk text with semantic boundaries and overlap
 */
function chunkText(
  text: string,
  heading: string,
  contentType: ChunkData["metadata"]["contentType"]
): string[] {
  const target =
    CHUNK_SIZE_TARGETS[contentType] || DEFAULT_TARGET;

  const chunks: string[] = [];

  // Split into paragraphs
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  let currentChunk = `${heading}\n\n`;
  let currentTokens = countTokens(currentChunk);

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraTokens = countTokens(para);

    // If paragraph alone exceeds max, split it
    if (paraTokens > MAX_TOKENS) {
      // Save current chunk if it has content
      if (currentChunk.trim() !== heading) {
        chunks.push(currentChunk.trim());
      }

      // Split large paragraph by sentences
      const sentenceChunks = chunkLargeParagraph(para, heading, target.max);
      chunks.push(...sentenceChunks);

      // Start fresh
      currentChunk = `${heading}\n\n`;
      currentTokens = countTokens(currentChunk);
      continue;
    }

    // Check if adding this paragraph would exceed target
    if (currentTokens + paraTokens > target.max) {
      // Save current chunk
      chunks.push(currentChunk.trim());

      // Start new chunk with overlap
      const overlap = getOverlapText(currentChunk, OVERLAP_TOKENS);
      currentChunk = `${heading}\n\n${overlap}\n\n${para}`;
      currentTokens = countTokens(currentChunk);
    } else {
      // Add paragraph to current chunk
      currentChunk += `\n\n${para}`;
      currentTokens += paraTokens;
    }
  }

  // Add final chunk if it has content
  if (currentChunk.trim() !== heading) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Chunk a large paragraph by sentences
 */
function chunkLargeParagraph(
  paragraph: string,
  heading: string,
  maxTokens: number
): string[] {
  const chunks: string[] = [];
  const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];

  let currentChunk = `${heading}\n\n`;
  let currentTokens = countTokens(currentChunk);

  for (const sentence of sentences) {
    const sentenceTokens = countTokens(sentence);

    if (currentTokens + sentenceTokens > maxTokens) {
      if (currentChunk.trim() !== heading) {
        chunks.push(currentChunk.trim());
      }

      // Start new chunk
      currentChunk = `${heading}\n\n${sentence}`;
      currentTokens = countTokens(currentChunk);
    } else {
      currentChunk += ` ${sentence}`;
      currentTokens += sentenceTokens;
    }
  }

  if (currentChunk.trim() !== heading) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Get overlap text (last N tokens of text)
 */
function getOverlapText(text: string, targetTokens: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  let overlap = "";
  let tokens = 0;

  // Add sentences from end until we reach target tokens
  for (let i = sentences.length - 1; i >= 0 && tokens < targetTokens; i--) {
    const sentence = sentences[i];
    const sentenceTokens = countTokens(sentence);

    if (tokens + sentenceTokens <= targetTokens) {
      overlap = sentence + overlap;
      tokens += sentenceTokens;
    } else {
      break;
    }
  }

  return overlap.trim();
}

/**
 * Format table for text representation
 */
function formatTable(table: ParsedContent["tables"][0]): string {
  let text = "";

  if (table.heading) {
    text += `${table.heading}\n\n`;
  }

  if (table.caption) {
    text += `${table.caption}\n\n`;
  }

  // Format as markdown-style table
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    text += row.join(" | ") + "\n";

    // Add separator after header row
    if (i === 0) {
      text += row.map(() => "---").join(" | ") + "\n";
    }
  }

  return text.trim();
}

/**
 * Detect content type from section heading and text
 */
function detectContentType(
  heading: string,
  text: string
): ChunkData["metadata"]["contentType"] | null {
  const lower = heading.toLowerCase() + " " + text.slice(0, 200).toLowerCase();

  if (
    /symptom|deficiency|disease|pest|identification|diagnos/.test(lower)
  ) {
    return "symptom";
  }

  if (
    /treatment|management|control|recommendation|application|spray/.test(lower)
  ) {
    return "treatment";
  }

  if (
    /product|fertilizer|pesticide|herbicide|fungicide|insecticide|rate|brand/.test(
      lower
    )
  ) {
    return "product";
  }

  if (
    /procedure|method|protocol|step|instruction|how to|guide/.test(lower)
  ) {
    return "procedure";
  }

  if (/background|introduction|biology|life cycle|science/.test(lower)) {
    return "background";
  }

  return null;
}
