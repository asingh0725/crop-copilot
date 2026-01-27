/**
 * Image Extraction from Parsed Documents
 */

import type { ParsedContent, ImageData, ImageExtractionStats } from "../scrapers/types";
import { v4 as uuidv4 } from "uuid";

export function extractImages(
  parsedContent: ParsedContent,
  sourceId: string
): ImageData[] {
  const images: ImageData[] = [];
  
  let position = 0;

  for (const section of parsedContent.sections) {
    for (const img of section.images) {
      if (!img.url) continue;

      images.push({
        id: uuidv4(),
        sourceId,
        imageUrl: img.url,
        altText: img.alt || null,
        caption: img.caption || null,
        contextText: img.contextText || null,
        contextChunkId: null,
        metadata: {
          category: categorizeImage(img.alt, img.caption, img.contextText),
          tags: extractTags(img.alt, img.caption, img.contextText),
          crop: extractCrop(img.alt, img.caption, img.contextText),
          subject: (img.alt || img.caption)?.slice(0, 60).trim(),
          position: position++,
        },
      });
    }
  }

  return images;
}

function categorizeImage(alt: string | undefined, caption: string | undefined, context: string): string {
  const text = `${alt || ""} ${caption || ""} ${context || ""}`.toLowerCase();
  
  if (/deficiency|deficient|nutrient|nitrogen|phosphorus|potassium|chlorosis|yellowing/.test(text)) return "deficiency";
  if (/disease|blight|rust|wilt|mildew|rot|virus|bacterial|fungal/.test(text)) return "disease";
  if (/pest|insect|beetle|aphid|caterpillar|larvae/.test(text)) return "pest";
  if (/stage|v[1-6]|vt|r[1-6]|vegetative|reproductive|flowering/.test(text)) return "growth_stage";
  if (/healthy|normal|typical|good|proper/.test(text)) return "healthy";
  
  return "general";
}

function extractTags(alt: string | undefined, caption: string | undefined, context: string): string[] {
  const text = `${alt || ""} ${caption || ""} ${context || ""}`.toLowerCase();
  const tags: Set<string> = new Set();

  ["nitrogen","phosphorus","potassium","sulfur","calcium","magnesium","zinc","iron","manganese","copper","boron"]
    .forEach(n => { if (text.includes(n)) tags.add(n); });
  
  ["chlorosis","necrosis","stunting","wilting","yellowing","purpling","bronzing","firing"]
    .forEach(s => { if (text.includes(s)) tags.add(s); });

  return Array.from(tags);
}

function extractCrop(alt: string | undefined, caption: string | undefined, context: string): string | undefined {
  const text = `${alt || ""} ${caption || ""} ${context || ""}`.toLowerCase();
  const crops = ["corn","maize","soybean","wheat","barley","oat","canola","cotton","rice","sorghum","alfalfa","potato","tomato"];
  return crops.find(c => text.includes(c));
}

export function calculateImageStats(images: ImageData[]): ImageExtractionStats {
  const byCategory: Record<string, number> = {};
  const byCrop: Record<string, number> = {};
  let totalAltTextLength = 0;
  let altTextCount = 0;
  let imagesWithContext = 0;
  let imagesWithCaptions = 0;

  for (const img of images) {
    const category = img.metadata.category || "general";
    byCategory[category] = (byCategory[category] || 0) + 1;

    if (img.metadata.crop) {
      byCrop[img.metadata.crop] = (byCrop[img.metadata.crop] || 0) + 1;
    }

    if (img.altText) {
      totalAltTextLength += img.altText.length;
      altTextCount++;
    }

    if (img.contextText) imagesWithContext++;
    if (img.caption) imagesWithCaptions++;
  }

  return {
    totalImages: images.length,
    byCategory,
    byCrop,
    avgAltTextLength: altTextCount > 0 ? Math.round(totalAltTextLength / altTextCount) : 0,
    imagesWithContext,
    imagesWithCaptions,
  };
}