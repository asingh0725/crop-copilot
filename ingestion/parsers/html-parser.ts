import * as cheerio from "cheerio";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { ParsedContent } from "../scrapers/types";

/**
 * Parse HTML content and extract structured information
 */
export function parseHTML(html: string, sourceUrl: string): ParsedContent {
  // Use Readability to extract main content
  const dom = new JSDOM(html, { url: sourceUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.content) {
    // Fallback to basic parsing if Readability fails
    return parseHTMLBasic(html, sourceUrl);
  }

  // Parse the cleaned content with cheerio
  const $ = cheerio.load(article.content);

  const sections: ParsedContent["sections"] = [];
  const tables: ParsedContent["tables"] = [];

  // Process sections
  let currentSection: ParsedContent["sections"][0] = {
    text: "",
    images: [],
  };

  $("body")
    .children()
    .each((_, elem) => {
      const $elem = $(elem);
      const tagName = elem.tagName.toLowerCase();

      // Headings start new sections
      if (/^h[1-6]$/.test(tagName)) {
        if (currentSection.text.trim() || currentSection.images.length > 0) {
          sections.push(currentSection);
        }

        currentSection = {
          heading: $elem.text().trim(),
          text: "",
          images: [],
        };
      }
      // Extract images
      else if (tagName === "img") {
        const image = extractImage($elem, $, sourceUrl);
        if (image) {
          currentSection.images.push(image);
        }
      }
      // Handle figures with images
      else if (tagName === "figure") {
        $elem.find("img").each((_, img) => {
          const image = extractImage($(img), $, sourceUrl);
          if (image) {
            // Get figcaption if present
            const caption = $elem.find("figcaption").text().trim();
            if (caption) {
              image.caption = caption;
            }
            currentSection.images.push(image);
          }
        });

        // Add figure text to section
        const figText = $elem.text().trim();
        if (figText) {
          currentSection.text += (currentSection.text ? "\n\n" : "") + figText;
        }
      }
      // Extract tables
      else if (tagName === "table") {
        const table = extractTable($elem, $);
        if (table) {
          tables.push(table);
        }
      }
      // Regular content
      else {
        const text = $elem.text().trim();
        if (text) {
          currentSection.text += (currentSection.text ? "\n\n" : "") + text;
        }
      }
    });

  // Add final section
  if (currentSection.text.trim() || currentSection.images.length > 0) {
    sections.push(currentSection);
  }

  // Get context text for images (3 paragraphs around each image)
  sections.forEach((section) => {
    section.images.forEach((image) => {
      image.contextText = getContextAroundImage(section.text, 3);
    });
  });

  // Calculate metadata
  const wordCount = sections.reduce(
    (sum, section) => sum + section.text.split(/\s+/).length,
    0
  );
  const imageCount = sections.reduce(
    (sum, section) => sum + section.images.length,
    0
  );

  return {
    title: article.title || "Untitled",
    sections,
    tables,
    metadata: {
      wordCount,
      imageCount,
      tableCount: tables.length,
    },
  };
}

/**
 * Basic HTML parsing fallback
 */
function parseHTMLBasic(html: string, sourceUrl: string): ParsedContent {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $("script, style, nav, header, footer, .sidebar, .ad, .advertisement").remove();

  const title = $("title").text().trim() || $("h1").first().text().trim();
  const sections: ParsedContent["sections"] = [];
  const tables: ParsedContent["tables"] = [];

  // Simple extraction of main content
  const mainSelectors = ["main", "article", ".content", "#content", "body"];
  let $main = $("body");

  for (const selector of mainSelectors) {
    const $elem = $(selector);
    if ($elem.length > 0) {
      $main = $elem.first() as cheerio.Cheerio<any>;
      break;
    }
  }

  let currentSection: ParsedContent["sections"][0] = {
    text: "",
    images: [],
  };

  $main.children().each((_, elem) => {
    const $elem = $(elem);
    const tagName = elem.tagName?.toLowerCase();

    if (/^h[1-6]$/.test(tagName || "")) {
      if (currentSection.text.trim() || currentSection.images.length > 0) {
        sections.push(currentSection);
      }

      currentSection = {
        heading: $elem.text().trim(),
        text: "",
        images: [],
      };
    } else if (tagName === "table") {
      const table = extractTable($elem, $);
      if (table) tables.push(table);
    } else {
      $elem.find("img").each((_, img) => {
        const image = extractImage($(img), $, sourceUrl);
        if (image) currentSection.images.push(image);
      });

      const text = $elem.text().trim();
      if (text) {
        currentSection.text += (currentSection.text ? "\n\n" : "") + text;
      }
    }
  });

  if (currentSection.text.trim() || currentSection.images.length > 0) {
    sections.push(currentSection);
  }

  const wordCount = sections.reduce(
    (sum, section) => sum + section.text.split(/\s+/).length,
    0
  );

  return {
    title,
    sections,
    tables,
    metadata: {
      wordCount,
      imageCount: sections.reduce((sum, s) => sum + s.images.length, 0),
      tableCount: tables.length,
    },
  };
}

/**
 * Extract image with metadata
 */
function extractImage(
  $img: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
  sourceUrl: string
): ParsedContent["sections"][0]["images"][0] | null {
  let src = $img.attr("src") || $img.attr("data-src");
  if (!src) return null;

  // Convert relative URLs to absolute
  if (src.startsWith("/")) {
    const url = new URL(sourceUrl);
    src = `${url.protocol}//${url.host}${src}`;
  } else if (!src.startsWith("http")) {
    const url = new URL(sourceUrl);
    const basePath = url.pathname.substring(0, url.pathname.lastIndexOf("/"));
    src = `${url.protocol}//${url.host}${basePath}/${src}`;
  }

  // Skip small images (likely icons/logos)
  const width = parseInt($img.attr("width") || "0");
  const height = parseInt($img.attr("height") || "0");
  if ((width > 0 && width < 300) || (height > 0 && height < 300)) {
    return null;
  }

  return {
    url: src,
    alt: $img.attr("alt"),
    caption: $img.parent("figure").find("figcaption").text().trim() || undefined,
    contextText: "", // Will be filled later
  };
}

/**
 * Extract table data
 */
function extractTable(
  $table: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI
): ParsedContent["tables"][0] | null {
  const rows: string[][] = [];

  $table.find("tr").each((_, tr) => {
    const row: string[] = [];
    $(tr)
      .find("th, td")
      .each((_, cell) => {
        row.push($(cell).text().trim());
      });
    if (row.length > 0) {
      rows.push(row);
    }
  });

  if (rows.length === 0) return null;

  // Try to get heading or caption
  const heading =
    $table.prev("h1, h2, h3, h4, h5, h6").text().trim() || undefined;
  const caption = $table.find("caption").text().trim() || undefined;

  return {
    heading,
    caption,
    rows,
  };
}

/**
 * Get context text around an image (approximate - get section text)
 */
function getContextAroundImage(sectionText: string, paragraphs: number): string {
  const sentences = sectionText.split(/\.\s+/);
  const maxSentences = paragraphs * 3; // Rough approximation

  if (sentences.length <= maxSentences) {
    return sectionText;
  }

  return sentences.slice(0, maxSentences).join(". ") + ".";
}
