import * as cheerio from "cheerio";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { ParsedContent } from "../scrapers/types";

/**
 * Parse HTML content and extract structured information
 */
export function parseHTML(html: string, sourceUrl: string): ParsedContent {
  // FIRST: Extract images from raw HTML before Readability cleans it
  const $raw = cheerio.load(html);
  const rawImages: Array<{
    url: string;
    alt?: string;
    caption?: string;
    contextText: string;
  }> = [];

  $raw('img').each((_, img) => {
    const $img = $raw(img);
    let src = $img.attr('src') || $img.attr('data-src');
    if (!src) return;

    // Convert relative URLs to absolute
    if (src.startsWith('/')) {
      const url = new URL(sourceUrl);
      src = `${url.protocol}//${url.host}${src}`;
    } else if (!src.startsWith('http')) {
      try {
        const url = new URL(sourceUrl);
        const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
        src = `${url.protocol}//${url.host}${basePath}/${src}`;
      } catch {
        return; // Skip invalid URLs
      }
    }

    // Skip small images (logos, icons)
    const width = parseInt($img.attr('width') || '0');
    const height = parseInt($img.attr('height') || '0');
    if ((width > 0 && width < 200) || (height > 0 && height < 200)) {
      return;
    }

    // Get caption from figure if present
    let caption: string | undefined;
    const $figure = $img.closest('figure');
    if ($figure.length) {
      caption = $figure.find('figcaption').text().trim() || undefined;
    }

    // Get surrounding paragraph text for context
    const contextParagraphs: string[] = [];
    $img.parent().prevAll('p').slice(0, 2).each((_, p) => {
      const text = $raw(p).text().trim();
      if (text) contextParagraphs.unshift(text);
    });
    $img.parent().nextAll('p').slice(0, 1).each((_, p) => {
      const text = $raw(p).text().trim();
      if (text) contextParagraphs.push(text);
    });

    rawImages.push({
      url: src,
      alt: $img.attr('alt') || undefined,
      caption,
      contextText: contextParagraphs.join(' '),
    });
  });

  console.log(`  🔍 Found ${rawImages.length} images in raw HTML (before Readability)`);

  // Use Readability to extract main content
  const dom = new JSDOM(html, { url: sourceUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    // Fallback to basic parsing if Readability fails
    return parseHTMLBasic(html, sourceUrl);
  }

  // Parse the cleaned content with cheerio
  const $ = cheerio.load(article.content ? article.content : '');

  const sections: ParsedContent["sections"] = [];
  const tables: ParsedContent["tables"] = [];

  // Process sections
  let currentSection: ParsedContent["sections"][0] = {
    text: "",
    images: rawImages, // Add all images to first section
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
  let $main: cheerio.Cheerio<any> = $("body");

  for (const selector of mainSelectors) {
    const $elem = $(selector);
    if ($elem.length > 0) {
      $main = $elem.first();
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
  if ((width > 0 && width < 200) || (height > 0 && height < 200)) {
    return null;
  }

  return {
    url: src,
    alt: $img.attr("alt") || undefined,
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