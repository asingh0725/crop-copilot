import type { ParsedContent, ChunkData } from "../scrapers/types";
import type { AgronomyChunkType } from "../types/agronomy";
import { countTokens } from "./chunker";

const VISUAL_RE =
  /symptom|sign|lesion|spot|blight|rot|mildew|rust|wilt|canker|scald|chlorosis|necrosis/i;
const THRESHOLD_RE =
  /threshold|scout|economic|injury|EIL|per\s+\d+|%|defoliation|rating|risk score/i;
const GROWTH_RE =
  /growth stage|v\\d|r\\d|bbch|bloom|flower|tuber|bolting|emergence|preplant|postemergence|pod set/i;
const TABLE_RE = /table|decision|risk|model|efficacy|fungicide|herbicide|insecticide/i;

export function containsProductRecommendations(text: string): boolean {
  const hasRates =
    /\\b\\d+(\\.\\d+)?\\s*(fl\\.?\\s*oz|oz|lb|gal|qt|pt|ml|l|g|kg)\\b/i.test(text) ||
    /\\b(rate|rates|apply|application)\\b/i.test(text) &&
      /\\b(oz|lb|gal|qt|pt|ml|l|g|ai|a\\.i\\.)\\b/i.test(text);

  const hasProductSignals =
    /\\b(trade name|brand name|formulation|active ingredient)\\b/i.test(text) ||
    /\\b(EC|SC|SL|WG|WP|DF|G)\\b/.test(text);

  return hasRates || hasProductSignals;
}

function detectChunkType(
  heading: string | undefined,
  text: string,
  isTable: boolean
): AgronomyChunkType {
  const basis = `${heading || ""} ${text.slice(0, 400)}`;

  if (isTable) {
    return "table";
  }

  if (VISUAL_RE.test(basis)) return "visual";
  if (THRESHOLD_RE.test(basis)) return "threshold";
  if (GROWTH_RE.test(basis)) return "narrative";
  if (TABLE_RE.test(basis)) return "table";

  return "narrative";
}

function formatTable(table: ParsedContent["tables"][0]): string {
  let text = "";

  if (table.heading) {
    text += `${table.heading}\n\n`;
  }

  if (table.caption) {
    text += `${table.caption}\n\n`;
  }

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    text += row.join(" | ") + "\n";
    if (i === 0) {
      text += row.map(() => "---").join(" | ") + "\n";
    }
  }

  return text.trim();
}

export function chunkAgronomyDocument(
  parsed: ParsedContent,
  sourceId: string,
  baseMeta: Omit<ChunkData["metadata"], "contentType" | "chunkType">,
  startingIndex = 0
): ChunkData[] {
  const chunks: ChunkData[] = [];
  let chunkIndex = startingIndex;

  for (const section of parsed.sections) {
    const heading = section.heading || "General";
    const text = section.text.trim();
    if (!text) continue;

    const chunkType = detectChunkType(heading, text, false);
    const content = `${heading}\n\n${text}`.trim();

    if (containsProductRecommendations(content)) {
      continue;
    }

    chunks.push({
      content,
      sourceId,
      chunkIndex: chunkIndex++,
      tokenCount: countTokens(content),
      metadata: {
        ...baseMeta,
        section: heading,
        heading,
        contentType: chunkType,
        chunkType,
      },
    });
  }

  for (const table of parsed.tables) {
    const tableText = formatTable(table);
    if (!tableText) continue;

    const chunkType = detectChunkType(table.heading, tableText, true);

    if (containsProductRecommendations(tableText)) {
      continue;
    }

    chunks.push({
      content: tableText,
      sourceId,
      chunkIndex: chunkIndex++,
      tokenCount: countTokens(tableText),
      metadata: {
        ...baseMeta,
        section: table.heading || "Table",
        heading: table.heading,
        contentType: chunkType,
        chunkType,
      },
    });
  }

  return chunks;
}
