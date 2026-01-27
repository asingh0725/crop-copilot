import { PDFParse, InvalidPDFException } from 'pdf-parse';
import type { ParsedContent } from '../scrapers/types';

/**
 * Parse PDF content using pdf-parse v2 API with robust error handling
 * Docs: https://www.npmjs.com/package/pdf-parse
 */
export async function parsePDF(
  buffer: Buffer,
  sourceUrl: string
): Promise<ParsedContent> {
  // Validate buffer
  if (!buffer || buffer.length === 0) {
    throw new Error('Empty buffer provided');
  }

  // Check if buffer looks like a PDF (starts with %PDF-)
  const headerCheck = buffer.slice(0, 5).toString('ascii');
  if (!headerCheck.startsWith('%PDF-')) {
    throw new Error(`Invalid PDF header. Got: "${headerCheck}". This may be HTML or another file type.`);
  }

  // Initialize parser with buffer data
  const parser = new PDFParse({ data: buffer });
  
  try {
    // Extract text from PDF
    const result = await parser.getText();
    
    // Validate we got text
    if (!result || !result.text) {
      throw new Error('PDF parsed but returned no text');
    }

    // Split content into pages (form feed character \f separates pages)
    const pages = result.text.split('\f').filter(page => page.trim().length > 0);
    
    if (pages.length === 0) {
      throw new Error('PDF contains no readable text');
    }

    const sections: ParsedContent['sections'] = [];
    let currentSection: ParsedContent['sections'][0] = {
      text: '',
      images: [],
    };

    // Process each page
    pages.forEach((pageText, pageIndex) => {
      const lines = pageText.split('\n');
      let pageContent = '';

      lines.forEach((line) => {
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
        text: result.text,
        images: [],
      });
    }

    // Extract tables (basic detection)
    const tables = extractTablesFromText(result.text);

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
        imageCount: 0, // PDF image extraction requires parser.getImage()
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
  } finally {
    // Always destroy parser to free memory
    await parser.destroy();
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
