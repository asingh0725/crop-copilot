/**
 * Detect actual content type from buffer content, not just URL/headers
 * This is critical because servers sometimes return HTML error pages
 * even when the URL ends in .pdf
 */

export function detectContentType(buffer: Buffer, url: string, declaredType?: string): 'pdf' | 'html' | 'unknown' {
    if (!buffer || buffer.length < 10) {
      return 'unknown';
    }
  
    // Check magic bytes (first few bytes of file)
    const header = buffer.slice(0, 10).toString('ascii');
    
    // PDF magic bytes: %PDF-
    if (header.startsWith('%PDF-')) {
      return 'pdf';
    }
    
    // HTML indicators: <!DOCTYPE, <html, <HTML, <?xml
    const htmlIndicators = ['<!DOCTYPE', '<!doctype', '<html', '<HTML', '<?xml', '<head', '<HEAD'];
    if (htmlIndicators.some(indicator => header.startsWith(indicator))) {
      return 'html';
    }
    
    // Check first 100 bytes for HTML tags
    const sample = buffer.slice(0, 100).toString('utf8').toLowerCase();
    if (sample.includes('<html') || sample.includes('<!doctype') || sample.includes('<head')) {
      return 'html';
    }
    
    // Fallback: trust the URL extension
    if (url.toLowerCase().endsWith('.pdf')) {
      console.warn(`⚠️  URL ends in .pdf but content doesn't look like PDF: ${url.substring(0, 60)}...`);
      console.warn(`   First 10 bytes: "${header}"`);
      return 'unknown'; // Don't assume PDF
    }
    
    if (url.toLowerCase().endsWith('.html') || url.toLowerCase().endsWith('.htm')) {
      return 'html';
    }
    
    // Last resort: check declared content-type from headers
    if (declaredType) {
      if (declaredType.includes('pdf')) return 'pdf';
      if (declaredType.includes('html')) return 'html';
    }
    
    return 'unknown';
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