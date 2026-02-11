/**
 * Detect actual content type from buffer content, not just URL/headers
 * This is critical because servers sometimes return HTML error pages
 * even when the URL ends in .pdf
 */
import zlib from "zlib";

export function detectContentType(
  buffer: Buffer,
  url: string,
  declaredType?: string
): "pdf" | "html" | "unknown" {
  return detectContentTypeInternal(buffer, url, declaredType, 0);
}

function detectContentTypeInternal(
  buffer: Buffer,
  url: string,
  declaredType: string | undefined,
  depth: number
): "pdf" | "html" | "unknown" {
  if (!buffer || buffer.length < 10) {
    return "unknown";
  }

  // Handle gzipped payloads (common on some sites)
  if (depth === 0 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      const inflated = zlib.gunzipSync(buffer);
      return detectContentTypeInternal(inflated, url, declaredType, depth + 1);
    } catch {
      // Fall through to normal detection
    }
  }

  // Check magic bytes (first few bytes of file)
  const header = buffer.slice(0, 10).toString("ascii");

  // PDF magic bytes: %PDF-
  if (header.startsWith("%PDF-")) {
    return "pdf";
  }

  // HTML indicators: <!DOCTYPE, <html, <HTML, <?xml
  const htmlIndicators = [
    "<!DOCTYPE",
    "<!doctype",
    "<html",
    "<HTML",
    "<?xml",
    "<head",
    "<HEAD",
  ];
  if (htmlIndicators.some((indicator) => header.startsWith(indicator))) {
    return "html";
  }

  // Check first 500 bytes for HTML tags or comments
  const sample = buffer.slice(0, 500).toString("utf8").toLowerCase();
  if (
    sample.includes("<html") ||
    sample.includes("<!doctype") ||
    sample.includes("<head") ||
    sample.includes("<meta") ||
    sample.includes("<!--")
  ) {
    return "html";
  }

  // Fallback: trust the URL extension
  if (url.toLowerCase().endsWith(".pdf")) {
    console.warn(
      `⚠️  URL ends in .pdf but content doesn't look like PDF: ${url.substring(
        0,
        60
      )}...`
    );
    console.warn(`   First 10 bytes: "${header}"`);
    return "unknown"; // Don't assume PDF
  }

  if (url.toLowerCase().endsWith(".html") || url.toLowerCase().endsWith(".htm")) {
    return "html";
  }

  // Last resort: check declared content-type from headers
  if (declaredType) {
    if (declaredType.includes("pdf")) return "pdf";
    if (declaredType.includes("html")) return "html";
  }

  return "unknown";
}
  
  /**
   * Quick check if buffer contains valid PDF
   */
  export function isValidPDF(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 5) return false;
    const header = buffer.slice(0, 5).toString('ascii');
    return header.startsWith('%PDF-');
  }
  
  /**
   * Quick check if buffer contains HTML
   */
  export function isHTML(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 10) return false;
    const header = buffer.slice(0, 100).toString('utf8').toLowerCase();
    return header.includes('<!doctype') || 
           header.includes('<html') || 
           header.includes('<head') ||
           header.startsWith('<?xml');
  }
