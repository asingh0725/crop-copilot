import { spawn } from 'node:child_process';

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
const SKIP_STATUSES = new Set([300, 400, 403, 406, 429]);

export interface ScrapedDocument {
  title: string;
  sections: Array<{ heading: string; body: string }>;
  rawText: string;
  url: string;
  fetchedAt: string;
}

export interface ScrapeOptions {
  pdfMode?: 'auto' | 'pdf_parse_only' | 'pymupdf_only' | 'pymupdf_preferred';
}

/**
 * Fetch and parse a source URL into a structured document.
 * Throws on non-2xx responses or network errors.
 * PDFs can be parsed via PyMuPDF (Python bridge), LlamaParse (optional), or pdf-parse fallback.
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
    const isPdf =
      contentType.toLowerCase().includes('application/pdf') ||
      /\.pdf(?:$|\?)/i.test(url);

    if (isPdf) {
      const buffer = await response.arrayBuffer();
      const pdfMode = options.pdfMode ?? 'auto';
      if (pdfMode === 'pymupdf_only') {
        return await parsePdfWithPyMuPdf(buffer, url, { fallbackToPdfParse: false });
      }
      if (pdfMode === 'pymupdf_preferred') {
        return await parsePdfWithPyMuPdf(buffer, url, { fallbackToPdfParse: true });
      }

      if (pdfMode === 'auto' && process.env.LLAMA_CLOUD_API_KEY) {
        try {
          return await parsePdfWithLlamaParse(buffer, url);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // Only fall back on rate-limit (429); all other errors propagate
          if (!msg.includes('429') && !msg.toLowerCase().includes('rate')) throw err;
          console.warn(`[Scraper] LlamaParse rate limit hit, falling back to pdf-parse: ${url}`);
        }
      }

      if (pdfMode !== 'pdf_parse_only') {
        try {
          return await parsePdfWithPyMuPdf(buffer, url, { fallbackToPdfParse: true });
        } catch (error) {
          console.warn('[Scraper] PyMuPDF parse failed, falling back to pdf-parse', {
            url,
            error: (error as Error).message,
          });
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
  return sanitizeForStorage(
    decodeHtmlEntities(stripTags(html))
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function decodeHtmlEntities(text: string): string {
  return sanitizeForStorage(
    text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  );
}

function sanitizeForStorage(value: string): string {
  return value
    .replace(/\u0000/g, ' ')
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[\ud800-\udfff]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

interface PyMuPdfSection {
  heading?: unknown;
  body?: unknown;
}

interface PyMuPdfOutput {
  title?: unknown;
  rawText?: unknown;
  sections?: unknown;
  metadata?: unknown;
}

const DEFAULT_PYMUPDF_TIMEOUT_MS = 120_000;
const DEFAULT_PYMUPDF_OCR_DPI = 150;
const DEFAULT_PYMUPDF_PYTHON_CANDIDATES = [
  'python3',
  'python',
  '/var/lang/bin/python3.12',
  '/var/lang/bin/python3',
  '/opt/bin/python3',
  '/opt/python/bin/python3',
];

const PYMUPDF_EXTRACTOR_SCRIPT = String.raw`
import base64
import json
import re
import sys
import traceback

try:
    import pymupdf
except Exception:
    try:
        import fitz as pymupdf
    except Exception as exc:
        sys.stderr.write(f"PyMuPDF import failed: {exc}\n")
        sys.exit(2)

CONTROL_RE = re.compile(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]')
SPACE_RE = re.compile(r'[ \t]+')
MULTI_NL_RE = re.compile(r'\n{3,}')

def clean_text(value):
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    value = value.replace("\x00", " ")
    value = CONTROL_RE.sub(" ", value)
    value = value.replace("\r", "\n")
    value = SPACE_RE.sub(" ", value)
    value = MULTI_NL_RE.sub("\n\n", value)
    return value.strip()

def title_from_url(url):
    try:
        from urllib.parse import urlparse, unquote
        parsed = urlparse(url)
        tail = parsed.path.rsplit("/", 1)[-1] or parsed.netloc or "Document"
        return clean_text(unquote(tail).replace(".pdf", "")) or "Document"
    except Exception:
        return "Document"

def extract_blocks_text(page):
    parts = []
    try:
        blocks = page.get_text("blocks", sort=True) or []
    except Exception:
        blocks = []
    for block in blocks:
        text = ""
        try:
            text = block[4]
        except Exception:
            continue
        text = clean_text(text)
        if text:
            parts.append(text)
    return "\n".join(parts).strip()

def extract_dict_text(page):
    parts = []
    try:
        data = page.get_text("dict", sort=True) or {}
    except Exception:
        data = {}
    for block in data.get("blocks", []):
        if block.get("type", 0) != 0:
            continue
        for line in block.get("lines", []):
            spans = []
            for span in line.get("spans", []):
                txt = clean_text(span.get("text", ""))
                if txt:
                    spans.append(txt)
            if spans:
                parts.append(" ".join(spans))
    return "\n".join(parts).strip()

def table_to_markdown(table):
    try:
        if hasattr(table, "to_markdown"):
            md = table.to_markdown()
            if md and clean_text(md):
                return md.strip()
    except Exception:
        pass

    try:
        rows = table.extract() or []
    except Exception:
        rows = []

    normalized_rows = []
    for row in rows:
        if not isinstance(row, (list, tuple)):
            continue
        normalized_rows.append([clean_text(cell if cell is not None else "") for cell in row])

    if not normalized_rows:
        return ""

    width = max(len(r) for r in normalized_rows)
    padded = [r + [""] * (width - len(r)) for r in normalized_rows]
    header = padded[0]
    separator = ["---"] * width
    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(separator) + " |",
    ]
    for row in padded[1:]:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)

def main():
    payload = json.loads(sys.stdin.read() or "{}")
    pdf_b64 = payload.get("pdfBase64", "")
    url = payload.get("url", "")
    enable_ocr = bool(payload.get("enableOcr", False))
    ocr_language = payload.get("ocrLanguage", "eng")
    ocr_dpi = int(payload.get("ocrDpi", 150) or 150)

    pdf_bytes = base64.b64decode(pdf_b64.encode("ascii"))
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")

    metadata = doc.metadata or {}
    title = clean_text(metadata.get("title", "")) or title_from_url(url)

    sections = []
    raw_parts = []
    warnings = []
    table_count = 0
    image_count = 0
    drawing_count = 0
    ocr_pages = 0

    for page_index in range(doc.page_count):
        page = doc.load_page(page_index)
        page_number = page_index + 1

        page_text = extract_blocks_text(page)
        if len(page_text) < 40:
            fallback_text = extract_dict_text(page)
            if len(fallback_text) > len(page_text):
                page_text = fallback_text

        try:
            page_image_count = len(page.get_images(full=True) or [])
        except Exception as exc:
            page_image_count = 0
            warnings.append(f"page {page_number}: image scan failed ({exc})")
        image_count += page_image_count

        try:
            page_drawing_count = len(page.get_drawings() or [])
        except Exception as exc:
            page_drawing_count = 0
            warnings.append(f"page {page_number}: drawing scan failed ({exc})")
        drawing_count += page_drawing_count

        page_tables = []
        try:
            finder = page.find_tables()
            tables = getattr(finder, "tables", []) if finder is not None else []
            for table_index, table in enumerate(tables):
                table_markdown = table_to_markdown(table)
                if table_markdown:
                    page_tables.append(f"Table {table_index + 1}\n{table_markdown}")
            table_count += len(page_tables)
        except Exception as exc:
            warnings.append(f"page {page_number}: table extraction failed ({exc})")

        if enable_ocr and len(page_text) < 40 and hasattr(page, "get_textpage_ocr"):
            try:
                textpage = page.get_textpage_ocr(language=ocr_language, dpi=ocr_dpi, full=True)
                ocr_text = clean_text(page.get_text("text", textpage=textpage, sort=True))
                if len(ocr_text) > len(page_text):
                    page_text = ocr_text
                    ocr_pages += 1
            except Exception as exc:
                warnings.append(f"page {page_number}: OCR failed ({exc})")

        body_parts = []
        if page_text:
            body_parts.append(page_text)
        if page_tables:
            body_parts.append("\n\n".join(page_tables))
        if not body_parts and page_image_count > 0:
            body_parts.append("[Image-only page detected. Enable OCR for scanned text extraction.]")
        if not body_parts and page_drawing_count > 0:
            body_parts.append("[Vector/shapes detected, but no extractable text found.]")

        body = clean_text("\n\n".join(body_parts))
        if body:
            heading = f"Page {page_number}"
            sections.append({"heading": heading, "body": body})
            raw_parts.append(f"{heading}\n\n{body}")

    raw_text = clean_text("\n\n".join(raw_parts))
    if not sections and raw_text:
        sections = [{"heading": title, "body": raw_text}]

    output = {
        "title": title,
        "sections": sections,
        "rawText": raw_text,
        "metadata": {
            "pageCount": doc.page_count,
            "tableCount": table_count,
            "imageCount": image_count,
            "drawingCount": drawing_count,
            "ocrPages": ocr_pages,
            "warnings": warnings[:25],
        },
    }
    sys.stdout.write(json.dumps(output, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        sys.stderr.write(f"PyMuPDF extractor failed: {exc}\n")
        sys.stderr.write(traceback.format_exc())
        sys.exit(1)
`;

function parseBooleanEnv(raw: string | undefined, fallback = false): boolean {
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parsePythonOutput(jsonText: string, url: string): ScrapedDocument {
  const trimmed = jsonText.trim();
  const candidates = new Set<string>([trimmed]);
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.add(trimmed.slice(firstBrace, lastBrace + 1));
  }

  let parsed: PyMuPdfOutput | null = null;
  let parseError: Error | null = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      parsed = JSON.parse(candidate) as PyMuPdfOutput;
      break;
    } catch (error) {
      parseError = error as Error;
    }
  }

  if (!parsed) {
    const snippet = trimmed.slice(0, 220).replace(/\s+/g, ' ');
    throw new Error(
      `PyMuPDF extractor returned invalid JSON for ${url}: ${
        parseError?.message ?? 'parse failure'
      }. Output snippet: ${snippet}`
    );
  }

  const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sections = rawSections
    .map((item): { heading: string; body: string } | null => {
      if (!item || typeof item !== 'object') return null;
      const section = item as PyMuPdfSection;
      const heading = sanitizeForStorage(String(section.heading ?? 'Document'));
      const body = sanitizeForStorage(String(section.body ?? ''));
      if (!body) return null;
      return { heading: heading || 'Document', body };
    })
    .filter((section): section is { heading: string; body: string } => section !== null);

  let fallbackTitle = 'Document';
  try {
    fallbackTitle =
      decodeURIComponent(new URL(url).pathname.split('/').pop()?.replace(/\.pdf$/i, '') ?? 'Document');
  } catch {
    fallbackTitle = 'Document';
  }
  const title = sanitizeForStorage(String(parsed.title ?? '')) || fallbackTitle;
  const rawTextCandidate = sanitizeForStorage(String(parsed.rawText ?? ''));
  const rawText = rawTextCandidate || sections.map((s) => `${s.heading}\n\n${s.body}`).join('\n\n');

  if (!rawText) {
    throw new Error(`PyMuPDF extractor returned empty text for ${url}`);
  }

  if (sections.length === 0) {
    sections.push({
      heading: title,
      body: rawText,
    });
  }

  const metadata = parsed.metadata as { warnings?: unknown } | undefined;
  if (Array.isArray(metadata?.warnings) && (metadata !== undefined && metadata.warnings.length > 0)) {
    console.warn('[Scraper] PyMuPDF warnings', {
      url,
      warnings: metadata.warnings.slice(0, 5),
    });
  }

  return {
    title,
    sections,
    rawText,
    url,
    fetchedAt: new Date().toISOString(),
  };
}

async function runPyMuPdfProcess(
  pythonBin: string,
  payload: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(pythonBin, ['-c', PYMUPDF_EXTRACTOR_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (error: Error | null, result?: { stdout: string; stderr: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      }
    };

    const timeoutId = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`PyMuPDF extractor timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (error) => {
      finish(error as Error);
    });

    child.stdin.on('error', (error) => {
      finish(error as Error);
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('close', (code) => {
      if (code !== 0) {
        finish(
          new Error(
            `PyMuPDF extractor exited with code ${code}. ${stderr.trim() || 'No stderr output.'}`
          )
        );
        return;
      }
      finish(null, { stdout, stderr });
    });

    try {
      child.stdin.write(payload);
      child.stdin.end();
    } catch (error) {
      finish(error as Error);
    }
  });
}

async function parsePdfWithPyMuPdf(
  buffer: ArrayBuffer,
  url: string,
  options: { fallbackToPdfParse: boolean }
): Promise<ScrapedDocument> {
  const timeoutMs = parsePositiveIntEnv(
    process.env.PYMUPDF_TIMEOUT_MS,
    DEFAULT_PYMUPDF_TIMEOUT_MS
  );
  const payload = JSON.stringify({
    url,
    pdfBase64: Buffer.from(buffer).toString('base64'),
    enableOcr: parseBooleanEnv(process.env.PYMUPDF_ENABLE_OCR, false),
    ocrLanguage: process.env.PYMUPDF_OCR_LANGUAGE?.trim() || 'eng',
    ocrDpi: parsePositiveIntEnv(process.env.PYMUPDF_OCR_DPI, DEFAULT_PYMUPDF_OCR_DPI),
  });

  const preferredPython = process.env.PYMUPDF_PYTHON_BIN?.trim();
  const pythonCandidates = [
    ...(preferredPython ? [preferredPython] : []),
    ...DEFAULT_PYMUPDF_PYTHON_CANDIDATES,
  ].filter((candidate, index, all) => candidate.length > 0 && all.indexOf(candidate) === index);

  let lastError: Error | null = null;
  const triedBinaries: string[] = [];
  for (const pythonBin of pythonCandidates) {
    triedBinaries.push(pythonBin);
    try {
      const { stdout, stderr } = await runPyMuPdfProcess(pythonBin, payload, timeoutMs);
      if (stderr.trim()) {
        console.warn('[Scraper] PyMuPDF stderr output', {
          pythonBin,
          url,
          stderr: stderr.slice(0, 800),
        });
      }
      return parsePythonOutput(stdout, url);
    } catch (error) {
      const message = (error as Error).message;
      const maybeMissingInterpreter =
        message.includes('ENOENT') ||
        message.includes('not found') ||
        message.includes('No such file');
      if (maybeMissingInterpreter) {
        lastError = error as Error;
        continue;
      }
      lastError = error as Error;
      break;
    }
  }

  const finalMessage = `${
    lastError?.message ?? 'Unknown PyMuPDF extraction error'
  } (tried python bins: ${triedBinaries.join(', ')})`;
  if (options.fallbackToPdfParse) {
    console.warn('[Scraper] Falling back to pdf-parse after PyMuPDF failure', {
      url,
      error: finalMessage,
    });
    try {
      return await parsePdfWithPdfParse(buffer, url);
    } catch (fallbackError) {
      console.warn('[Scraper] pdf-parse fallback failed; marking source as empty', {
        url,
        error: (fallbackError as Error).message,
      });
      return emptyDocument(url);
    }
  }

  throw new Error(finalMessage);
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
 * Used as a fallback when upstream PDF parsers are unavailable.
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
      if (typeof candidate === 'function') {
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

  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const message = typeof args[0] === 'string' ? args[0] : '';
    if (
      message.includes('Cannot polyfill `DOMMatrix`') ||
      message.includes('Cannot polyfill `ImageData`') ||
      message.includes('Cannot polyfill `Path2D`') ||
      message.includes('Cannot access the `require` function')
    ) {
      return;
    }
    originalWarn(...args);
  };

  try {
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

    async function tryPdfParseClass(candidate: PdfParseClass): Promise<string | null> {
      let parser: PdfParseInstance | null = null;
      try {
        parser = new candidate({ data: buf });
        if (!parser || typeof parser.getText !== 'function') {
          return null;
        }
        const result = await parser.getText();
        return result.text ?? '';
      } finally {
        await parser?.destroy?.();
      }
    }

    for (const candidateModule of moduleCandidates) {
      const v2Class = pickPdfParseV2Class(candidateModule);
      if (v2Class) {
        try {
          const v2Text = await tryPdfParseClass(v2Class);
          if (typeof v2Text === 'string') {
            text = v2Text;
            break;
          }
        } catch {
          // Fall through to v1 function path below for this module candidate.
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
  } finally {
    console.warn = originalWarn;
  }
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
