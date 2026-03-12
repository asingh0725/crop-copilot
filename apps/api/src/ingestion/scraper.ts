/**
 * Web scraper for agricultural document sources.
 *
 * Fetches HTML from a URL, strips boilerplate (nav, footer, scripts, ads),
 * and returns clean {title, sections} ready for chunking.
 *
 * Intentionally dependency-free — uses only Node's built-in fetch and
 * simple regex-based HTML stripping to keep the Lambda bundle small.
 */

const USER_AGENT =
  'Mozilla/5.0 (compatible; CropCopilot-Bot/1.0; +https://cropcopilot.app/bot)';

const FETCH_TIMEOUT_MS = 30_000;

// HTTP status codes that indicate the site won't serve us content —
// treat as empty (not an error) so the source doesn't stay in error state.
const SKIP_STATUSES = new Set([403, 406, 429]);

export interface ScrapedDocument {
  title: string;
  sections: Array<{ heading: string; body: string }>;
  rawText: string;
  url: string;
  fetchedAt: string;
}

export interface ScrapeOptions {
  pdfMode?: 'auto' | 'pdf_parse_only';
}

/**
 * Fetch and parse a source URL into a structured document.
 * Throws on non-2xx responses or network errors.
 * PDFs are parsed via LlamaParse (requires LLAMA_CLOUD_API_KEY).
 * Returns an empty document for sites that block scraping (403/406/429) so sources aren't stuck in error.
 */
export async function scrapeUrl(url: string, options: ScrapeOptions = {}): Promise<ScrapedDocument> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        // Include application/pdf so Google redirect URLs don't return 406
        Accept: 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (SKIP_STATUSES.has(response.status)) {
        console.warn(`[Scraper] Skipping ${url} — HTTP ${response.status} (site blocks scraping)`);
        return emptyDocument(url);
      }
      throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${url}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/pdf')) {
      const buffer = await response.arrayBuffer();
      const pdfMode = options.pdfMode ?? 'auto';
      if (pdfMode !== 'pdf_parse_only' && process.env.LLAMA_CLOUD_API_KEY) {
        try {
          return await parsePdfWithLlamaParse(buffer, url);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // Only fall back on rate-limit (429); all other errors propagate
          if (!msg.includes('429') && !msg.toLowerCase().includes('rate')) throw err;
          console.warn(`[Scraper] LlamaParse rate limit hit, falling back to pdf-parse: ${url}`);
        }
      }
      return await parsePdfWithPdfParse(buffer, url);
    }
    if (!contentType.includes('html') && !contentType.includes('text')) {
      console.warn(`[Scraper] Skipping unsupported content-type "${contentType}": ${url}`);
      return emptyDocument(url);
    }

    html = await response.text();
  } finally {
    clearTimeout(timeoutId);
  }

  return parseHtml(html, url);
}

function emptyDocument(url: string): ScrapedDocument {
  let hostname = url;
  try { hostname = new URL(url).hostname; } catch { /* keep raw url */ }
  return { title: hostname, sections: [], rawText: '', url, fetchedAt: new Date().toISOString() };
}

function parseHtml(html: string, url: string): ScrapedDocument {
  // Strip boilerplate elements entirely
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Extract <title>
  const titleMatch = cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? decodeHtmlEntities(stripTags(titleMatch[1])) : '';
  const title = rawTitle.trim() || new URL(url).hostname;

  // Extract sections by heading tags (h1–h4)
  const sections: Array<{ heading: string; body: string }> = [];

  // Find <main> or <article> first, fall back to <body>
  const mainMatch =
    cleaned.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i) ||
    cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i) ||
    cleaned.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);

  const content = mainMatch ? mainMatch[1] : cleaned;

  // Split by heading tags to create sections
  const headingPattern = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  let lastIndex = 0;
  let currentHeading = title;
  let match: RegExpExecArray | null;

  const headingMatches: Array<{ index: number; heading: string }> = [];
  while ((match = headingPattern.exec(content)) !== null) {
    headingMatches.push({
      index: match.index,
      heading: decodeHtmlEntities(stripTags(match[1])).trim(),
    });
  }

  for (let i = 0; i < headingMatches.length; i++) {
    const { index, heading } = headingMatches[i]!;
    const nextIndex = headingMatches[i + 1]?.index ?? content.length;

    // Body text before this heading belongs to the previous section
    if (index > lastIndex) {
      const bodyHtml = content.slice(lastIndex, index);
      const bodyText = cleanText(bodyHtml);
      if (bodyText.length > 80) {
        sections.push({ heading: currentHeading, body: bodyText });
      }
    }

    currentHeading = heading || currentHeading;
    lastIndex = index + (headingMatches[i + 1]?.index ?? content.length - index);

    // Body text for this heading
    const bodyHtml = content.slice(index, nextIndex);
    const bodyText = cleanText(bodyHtml);
    if (bodyText.length > 80) {
      sections.push({ heading, body: bodyText });
    }
  }

  // If no headings found, treat entire content as one section
  if (sections.length === 0) {
    const bodyText = cleanText(content);
    if (bodyText.length > 80) {
      sections.push({ heading: title, body: bodyText });
    }
  }

  const rawText = sections.map((s) => `${s.heading}\n\n${s.body}`).join('\n\n');

  return {
    title,
    sections,
    rawText,
    url,
    fetchedAt: new Date().toISOString(),
  };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}

function cleanText(html: string): string {
  return decodeHtmlEntities(stripTags(html))
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// ── PDF parsing via LlamaParse ───────────────────────────────────────────────

const LLAMA_PARSE_BASE = 'https://api.cloud.llamaindex.ai/api/parsing';
const LLAMA_POLL_INTERVAL_MS = 3_000;
const LLAMA_MAX_POLLS = 10; // 30 seconds max wait

/**
 * Parse a PDF using the LlamaParse REST API.
 * Requires LLAMA_CLOUD_API_KEY to be set.
 * Returns a ScrapedDocument with sections derived from markdown headings.
 */
async function parsePdfWithLlamaParse(buffer: ArrayBuffer, url: string): Promise<ScrapedDocument> {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(`LLAMA_CLOUD_API_KEY is required to parse PDFs (url: ${url})`);
  }

  // 1. Upload the PDF
  const filename = new URL(url).pathname.split('/').pop() ?? 'document.pdf';
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: 'application/pdf' }), filename);

  const uploadResponse = await fetch(`${LLAMA_PARSE_BASE}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text().catch(() => '');
    throw new Error(`LlamaParse upload failed ${uploadResponse.status}: ${text.slice(0, 200)}`);
  }

  const uploadPayload = (await uploadResponse.json()) as { id?: string; job_id?: string };
  const jobId = uploadPayload.job_id ?? uploadPayload.id;
  if (!jobId) {
    throw new Error('LlamaParse upload did not return a job_id');
  }

  // 2. Poll for completion
  let attempts = 0;
  while (attempts < LLAMA_MAX_POLLS) {
    await new Promise((resolve) => setTimeout(resolve, LLAMA_POLL_INTERVAL_MS));
    attempts++;

    const statusResponse = await fetch(`${LLAMA_PARSE_BASE}/job/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!statusResponse.ok) {
      // 429 during polling means rate-limited — throw immediately so the caller
      // can fall back to pdf-parse instead of silently retrying until timeout.
      if (statusResponse.status === 429) {
        throw new Error('LlamaParse 429: rate limited during job status polling');
      }
      continue; // other transient errors — keep polling
    }

    const statusPayload = (await statusResponse.json()) as { status?: string };
    const jobStatus = statusPayload.status?.toUpperCase();

    if (jobStatus === 'SUCCESS') break;
    if (jobStatus === 'ERROR' || jobStatus === 'CANCELLED') {
      throw new Error(`LlamaParse job ${jobId} ended with status ${jobStatus}`);
    }
    // PENDING / PROCESSING — keep polling
  }

  if (attempts >= LLAMA_MAX_POLLS) {
    throw new Error(`LlamaParse job ${jobId} did not complete within ${LLAMA_MAX_POLLS * LLAMA_POLL_INTERVAL_MS / 1000}s`);
  }

  // 3. Download markdown result
  const resultResponse = await fetch(`${LLAMA_PARSE_BASE}/job/${jobId}/result/markdown`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!resultResponse.ok) {
    throw new Error(`LlamaParse result download failed: ${resultResponse.status}`);
  }

  const resultPayload = (await resultResponse.json()) as { markdown?: string };
  const markdown = resultPayload.markdown ?? '';

  // 4. Parse markdown into sections
  return parseMarkdownToDocument(markdown, url);
}

/**
 * Convert LlamaParse markdown output into a ScrapedDocument.
 * Splits on ## / ### headings; falls back to page-break markers (---).
 */
function parseMarkdownToDocument(markdown: string, url: string): ScrapedDocument {
  // Extract title from first # heading
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch
    ? titleMatch[1].trim()
    : (new URL(url).pathname.split('/').pop()?.replace('.pdf', '') ?? 'Document');

  // Split into sections on ## or ### headings
  const sectionPattern = /^#{2,3}\s+(.+)$/gm;
  const sections: Array<{ heading: string; body: string }> = [];

  let lastIndex = 0;
  let currentHeading = title;
  let match: RegExpExecArray | null;

  const headingMatches: Array<{ index: number; heading: string }> = [];
  while ((match = sectionPattern.exec(markdown)) !== null) {
    headingMatches.push({ index: match.index, heading: match[1].trim() });
  }

  for (let i = 0; i < headingMatches.length; i++) {
    const { index, heading } = headingMatches[i]!;
    const nextIndex = headingMatches[i + 1]?.index ?? markdown.length;

    if (index > lastIndex) {
      const body = markdown.slice(lastIndex, index).replace(/^#+\s+.+$/gm, '').trim();
      if (body.length > 80) sections.push({ heading: currentHeading, body });
    }

    currentHeading = heading;
    lastIndex = index;

    const body = markdown.slice(index, nextIndex).replace(/^#+\s+.+$/gm, '').trim();
    if (body.length > 80) sections.push({ heading, body });
  }

  // Fallback: no headings — use page breaks or treat as one block
  if (sections.length === 0) {
    const pages = markdown.split(/^---$/m).filter((p) => p.trim().length > 80);
    for (let i = 0; i < pages.length; i++) {
      sections.push({ heading: `Page ${i + 1}`, body: pages[i].trim() });
    }
    if (sections.length === 0 && markdown.trim().length > 80) {
      sections.push({ heading: title, body: markdown.trim() });
    }
  }

  const rawText = sections.map((s) => `${s.heading}\n\n${s.body}`).join('\n\n');
  return { title, sections, rawText, url, fetchedAt: new Date().toISOString() };
}

// ── PDF parsing fallback via pdf-parse ──────────────────────────────────────

/**
 * Parse a PDF using the pdf-parse library (no API key required).
 * Used as a fallback when LlamaParse is unavailable or rate-limited.
 * Compatible with both pdf-parse v1 (function export) and v2 (PDFParse class).
 */
async function parsePdfWithPdfParse(buffer: ArrayBuffer, url: string): Promise<ScrapedDocument> {
  type PdfParseFn = (buf: Buffer) => Promise<{ text: string }>;
  type PdfParseInstance = {
    getText(): Promise<{ text?: string }>;
    destroy?: () => Promise<void> | void;
  };
  type PdfParseClass = new (opts: { data: Buffer }) => PdfParseInstance;
  type UnknownModule = Record<string, unknown> | null | undefined;

  function pickPdfParseV2Class(mod: UnknownModule): PdfParseClass | null {
    const candidates: unknown[] = [
      mod,
      mod?.PDFParse,
      (mod?.default as UnknownModule)?.PDFParse,
      mod?.default,
      (mod?.module as UnknownModule)?.exports,
      ((mod?.module as UnknownModule)?.exports as UnknownModule)?.PDFParse,
    ];

    for (const candidate of candidates) {
      if (
        typeof candidate === 'function' &&
        typeof (candidate as { prototype?: { getText?: unknown } }).prototype?.getText === 'function'
      ) {
        return candidate as PdfParseClass;
      }
    }
    return null;
  }

  function pickPdfParseV1Function(mod: UnknownModule): PdfParseFn | null {
    const candidates: unknown[] = [mod, mod?.default];
    for (const candidate of candidates) {
      if (
        typeof candidate === 'function' &&
        typeof (candidate as { prototype?: { getText?: unknown } }).prototype?.getText !== 'function'
      ) {
        return candidate as PdfParseFn;
      }
    }
    return null;
  }

  const moduleCandidates: UnknownModule[] = [];

  // Prefer the documented v2 usage path (import { PDFParse } from 'pdf-parse').
  try {
    const imported = (await import('pdf-parse')) as UnknownModule;
    moduleCandidates.push(imported);
  } catch {
    // fall through to require-based loading
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const required = (() => { try { return require('pdf-parse') as UnknownModule; } catch { return null; } })();
  if (required) {
    moduleCandidates.push(required);
  }

  let text: string;
  const buf = Buffer.from(buffer);
  text = '';

  for (const candidateModule of moduleCandidates) {
    const v2Class = pickPdfParseV2Class(candidateModule);
    if (v2Class) {
      const parser = new v2Class({ data: buf });
      try {
        const result = await parser.getText();
        text = result.text ?? '';
        break;
      } finally {
        await parser.destroy?.();
      }
    }

    const v1Function = pickPdfParseV1Function(candidateModule);
    if (v1Function) {
      const result = await v1Function(buf);
      text = result.text ?? '';
      break;
    }
  }

  if (!text && moduleCandidates.length === 0) {
    throw new Error('pdf-parse module is unavailable');
  }

  if (!text) {
    const sample = moduleCandidates
      .slice(0, 2)
      .map((mod) => Object.keys(mod ?? {}).slice(0, 12))
      .flat();
    throw new Error(`pdf-parse: unsupported export shape (${sample.join(', ')})`);
  }

  if (!text.trim()) {
    return emptyDocument(url);
  }

  const sections = splitPdfTextIntoSections(text);
  const title = sections[0]?.heading || extractFirstLine(text) ||
    decodeURIComponent(new URL(url).pathname.split('/').pop()?.replace(/\.pdf$/i, '') ?? 'Document');
  const rawText = sections.map((s) => `${s.heading}\n\n${s.body}`).join('\n\n');
  return { title, sections, rawText, url, fetchedAt: new Date().toISOString() };
}

function splitPdfTextIntoSections(text: string): Array<{ heading: string; body: string }> {
  // pdf-parse separates pages with \f; split and group by heuristic headings
  const pages = text.split('\f');
  const sections: Array<{ heading: string; body: string }> = [];
  let currentHeading = '';
  let currentBody = '';

  for (const page of pages) {
    const lines = page.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Heuristic heading: short line, starts with capital, not ending with period
      const isHeading =
        line.length > 3 &&
        line.length < 80 &&
        /^[A-Z]/.test(line) &&
        !line.endsWith('.') &&
        !/^\d/.test(line);

      if (isHeading && currentBody.trim().length > 40) {
        sections.push({ heading: currentHeading, body: currentBody.trim() });
        currentHeading = line;
        currentBody = '';
      } else if (isHeading && !currentBody) {
        currentHeading = line;
      } else {
        currentBody += (currentBody ? ' ' : '') + line;
      }
    }
  }

  if (currentBody.trim()) {
    sections.push({ heading: currentHeading, body: currentBody.trim() });
  }

  // Fallback: one big section
  if (sections.length === 0) {
    const body = text.replace(/\f/g, '\n\n').replace(/\s+/g, ' ').trim().slice(0, 8000);
    if (body) sections.push({ heading: '', body });
  }

  return sections;
}

function extractFirstLine(text: string): string | null {
  const line = text.trim().split('\n')[0]?.trim();
  return line && line.length < 120 ? line : null;
}
