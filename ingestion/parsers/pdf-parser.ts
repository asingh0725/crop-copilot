import type { PDFParse as PDFParseType } from "pdf-parse";
import type { ParsedContent } from "../scrapers/types";

let PDFParseClass: typeof PDFParseType | null = null;
let pdfParseFn: ((buffer: Buffer) => Promise<{ text: string }>) | null = null;

function getPdfParser() {
  if (PDFParseClass || pdfParseFn) {
    return { PDFParseClass, pdfParseFn };
  }

  // pdf-parse v2 exposes PDFParse class; v1 exposes a default function
  // Use dynamic require to avoid ESM/CJS interop issues.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("pdf-parse");
  PDFParseClass = mod.PDFParse || mod.default?.PDFParse || null;
  pdfParseFn = mod.default || (typeof mod === "function" ? mod : null);

  return { PDFParseClass, pdfParseFn };
}

// Custom error class for invalid PDF
class InvalidPDFException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPDFException';
  }
}

/**
 * Parse PDF content using pdf-parse with robust error handling
 * Docs: https://www.npmjs.com/package/pdf-parse
 */
export async function parsePDF(
  buffer: Buffer,
  sourceUrl: string
): Promise<ParsedContent> {
  // Check if buffer looks like a PDF (starts with %PDF-)
  const headerCheck = buffer.slice(0, 5).toString('ascii');
  if (!headerCheck.startsWith('%PDF-')) {
    throw new Error(`Invalid PDF header. Got: "${headerCheck}". This may be HTML or another file type.`);
  }

  try {
    const { PDFParseClass, pdfParseFn } = getPdfParser();
    let data: { text: string };

    if (PDFParseClass) {
      const parser = new PDFParseClass({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      data = { text: result.text || "" };
    } else if (pdfParseFn) {
      data = await pdfParseFn(buffer);
    } else {
      throw new Error("pdf-parse parser not available");
    }

    // Validate we got text
    if (!data || !data.text) {
      throw new Error('PDF parsed but returned no text');
    }

    // Split content into pages (form feed character \f separates pages)
    const pages = data.text.split('\f').filter((page: string) => page.trim().length > 0);

    if (pages.length === 0) {
      throw new Error('PDF contains no readable text');
    }

    const sections: ParsedContent['sections'] = [];
    let currentSection: ParsedContent['sections'][0] = {
      text: '',
      images: [],
    };

    // Process each page
    pages.forEach((pageText: string, pageIndex: number) => {
      const lines = pageText.split('\n');
      let pageContent = '';

      lines.forEach((line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Detect headings (heuristic: short lines in ALL CAPS or title case)
        const isHeading =
          trimmed.length < 80 &&
          trimmed.length > 3 && // Must be at least 4 chars
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
            text: '',
            images: [],
          };
        } else {
          pageContent += (pageContent ? ' ' : '') + trimmed;
        }
      });

      // Add page content to current section
      if (pageContent.trim()) {
        currentSection.text +=
          (currentSection.text ? '\n\n' : '') +
          `[Page ${pageIndex + 1}] ` +
          pageContent;
      }
    });

    // Add final section
    if (currentSection.text.trim()) {
      sections.push(currentSection);
    }

    // If no sections created, create a single section with all text
    if (sections.length === 0) {
      sections.push({
        text: data.text,
        images: [],
      });
    }

    // Extract tables (basic detection)
    const tables = extractTablesFromText(data.text);

    // Calculate metadata
    const wordCount = sections.reduce(
      (sum, section) => sum + section.text.split(/\s+/).length,
      0
    );

    // Extract title (try first non-empty line or first heading)
    let title = 'Untitled PDF';
    if (sections.length > 0) {
      if (sections[0].heading) {
        title = sections[0].heading;
      } else {
        const firstLine = sections[0].text.split('\n')[0]?.trim();
        if (firstLine && firstLine.length < 100) {
          title = firstLine;
        }
      }
    }

    // Ensure title is reasonable
    title = title.substring(0, 200); // Max 200 chars

    return {
      title,
      sections,
      tables,
      metadata: {
        wordCount,
        imageCount: 0, // PDF image extraction would require additional parsing
        tableCount: tables.length,
      },
    };
  } catch (error) {
    // Handle known PDF parsing errors gracefully
    if (error instanceof InvalidPDFException) {
      throw new Error(
        `Invalid PDF structure at ${sourceUrl}. ` +
        `This PDF may be corrupted, password-protected, or use an unsupported format. ` +
        `Original error: ${error.message}`
      );
    }

    // Re-throw with context
    throw new Error(
      `Failed to parse PDF from ${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Extract tables from text (basic heuristic detection)
 */
function extractTablesFromText(text: string): ParsedContent['tables'] {
  const tables: ParsedContent['tables'] = [];
  const lines = text.split('\n');

  let inTable = false;
  let currentTable: string[][] = [];
  let tableName: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

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
            (prevLine.toLowerCase().includes('table') ||
              prevLine.toLowerCase().includes('figure'))
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

/**
 * Validate if a buffer contains a valid PDF
 * Returns true if buffer starts with PDF magic bytes
 */
export function isValidPDF(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 5) return false;
  const header = buffer.slice(0, 5).toString('ascii');
  return header.startsWith('%PDF-');
}
