import * as pdfParse from "pdf-parse";
import type { ParsedContent } from "../scrapers/types";

const pdf = (pdfParse as any).default || pdfParse;

/**
 * Parse PDF content and extract structured information
 */
export async function parsePDF(
  buffer: Buffer,
  sourceUrl: string
): Promise<ParsedContent> {
  const data = await pdf(buffer);

  // Split content into pages
  const pages = data.text.split("\f"); // Form feed character separates pages in pdf-parse

  const sections: ParsedContent["sections"] = [];
  let currentSection: ParsedContent["sections"][0] = {
    text: "",
    images: [],
  };

  // Process each page
  pages.forEach((pageText: string, pageIndex: number) => {
    const lines = pageText.split("\n");
    let pageContent = "";

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Detect headings (heuristic: short lines in ALL CAPS or title case)
      const isHeading =
        trimmed.length < 80 &&
        (trimmed === trimmed.toUpperCase() ||
          /^[A-Z][a-z]+(?: [A-Z][a-z]+)*:?$/.test(trimmed));

      if (isHeading) {
        // Save current section if it has content
        if (currentSection.text.trim()) {
          sections.push(currentSection);
        }

        // Start new section
        currentSection = {
          heading: trimmed,
          text: "",
          images: [],
        };
      } else {
        pageContent += (pageContent ? " " : "") + trimmed;
      }
    });

    // Add page content to current section
    if (pageContent.trim()) {
      currentSection.text +=
        (currentSection.text ? "\n\n" : "") +
        `[Page ${pageIndex + 1}] ` +
        pageContent;
    }
  });

  // Add final section
  if (currentSection.text.trim()) {
    sections.push(currentSection);
  }

  // Extract tables (basic detection)
  const tables = extractTablesFromText(data.text);

  // Calculate metadata
  const wordCount = sections.reduce(
    (sum, section) => sum + section.text.split(/\s+/).length,
    0
  );

  // Extract title (try first non-empty line or first heading)
  let title = "Untitled PDF";
  if (sections.length > 0) {
    if (sections[0].heading) {
      title = sections[0].heading;
    } else {
      const firstLine = sections[0].text.split("\n")[0]?.trim();
      if (firstLine && firstLine.length < 100) {
        title = firstLine;
      }
    }
  }

  return {
    title,
    sections,
    tables,
    metadata: {
      wordCount,
      imageCount: 0, // PDF image extraction requires additional libraries
      tableCount: tables.length,
    },
  };
}

/**
 * Extract tables from text (basic heuristic detection)
 */
function extractTablesFromText(text: string): ParsedContent["tables"] {
  const tables: ParsedContent["tables"] = [];
  const lines = text.split("\n");

  let inTable = false;
  let currentTable: string[][] = [];
  let tableName: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect table start (heuristic: line with multiple tab-separated values or aligned columns)
    const hasMultipleColumns = /\t.+\t/.test(line) || /\s{3,}.+\s{3,}/.test(line);

    if (hasMultipleColumns) {
      if (!inTable) {
        inTable = true;
        // Look back for table name/caption
        if (i > 0) {
          const prevLine = lines[i - 1].trim();
          if (
            prevLine.length < 100 &&
            (prevLine.toLowerCase().includes("table") ||
              prevLine.toLowerCase().includes("figure"))
          ) {
            tableName = prevLine;
          }
        }
      }

      // Split by tabs or multiple spaces
      const cells = line
        .split(/\t+|\s{3,}/)
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);

      if (cells.length > 1) {
        currentTable.push(cells);
      }
    } else if (inTable) {
      // End of table
      if (currentTable.length > 1) {
        // Only save if at least 2 rows
        tables.push({
          heading: tableName,
          rows: currentTable,
        });
      }

      inTable = false;
      currentTable = [];
      tableName = undefined;
    }
  }

  // Save last table if exists
  if (currentTable.length > 1) {
    tables.push({
      heading: tableName,
      rows: currentTable,
    });
  }

  return tables;
}
