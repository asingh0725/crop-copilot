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

/**
 * Fetch and parse a source URL into a structured document.
 * Throws on non-2xx responses or network errors.
 * PDFs are parsed via LlamaParse (requires LLAMA_CLOUD_API_KEY).
 * Returns an empty document for sites that block scraping (403/406/429) so sources aren't stuck in error.
 */
export async function scrapeUrl(url: string): Promise<ScrapedDocument> {
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
      return parsePdfWithLlamaParse(buffer, url);
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

    if (!statusResponse.ok) continue;

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
