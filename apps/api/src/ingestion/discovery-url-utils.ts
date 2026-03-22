interface JsonLikeRecord {
  [key: string]: unknown;
}

interface GeminiContentPart {
  text?: string;
}

interface GeminiGroundingChunk {
  web?: { uri?: string; title?: string };
}

interface GeminiCandidateLike {
  content?: {
    parts?: GeminiContentPart[];
  };
  groundingMetadata?: {
    groundingChunks?: GeminiGroundingChunk[];
  };
}

export interface ParsedDiscoveryUrl {
  url: string;
  title: string;
  sourceTypeHint?: string;
}

const DISCOVERY_VALIDATION_USER_AGENT =
  'Mozilla/5.0 (compatible; CropCopilot-Discovery/1.0; +https://cropcopilot.app/bot)';

const BLOCKED_DISCOVERY_HOSTS = new Set([
  'vertexaisearch.cloud.google.com',
  'validate.perfdrive.com',
]);

const TRACKING_QUERY_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ref',
  'ref_src',
  'source',
]);

const REDIRECT_QUERY_KEYS = ['url', 'u', 'q', 'target', 'dest', 'destination', 'redirect'];

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  return trimmed;
}

function normalizeRawUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^<+/, '')
    .replace(/>+$/, '')
    .replace(/^[("'`]+/, '')
    .replace(/[)"'`.,;!?]+$/, '');
}

function safeParseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function maybeUnwrapRedirect(url: URL): URL | null {
  const hostname = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (
    (hostname === 'www.google.com' || hostname === 'google.com') &&
    (path === '/url' || path === '/imgres')
  ) {
    for (const key of REDIRECT_QUERY_KEYS) {
      const value = url.searchParams.get(key);
      if (!value) continue;
      const decoded = safeParseUrl(decodeURIComponent(value));
      if (decoded) return decoded;
      const plain = safeParseUrl(value);
      if (plain) return plain;
    }
  }

  if (hostname === 'l.facebook.com' || hostname === 'lm.facebook.com') {
    const value = url.searchParams.get('u');
    if (value) {
      const decoded = safeParseUrl(decodeURIComponent(value)) ?? safeParseUrl(value);
      if (decoded) return decoded;
    }
  }

  if (hostname === 'validate.perfdrive.com') {
    const value = url.searchParams.get('ssc');
    if (value) {
      const decoded = safeParseUrl(decodeURIComponent(value)) ?? safeParseUrl(value);
      if (decoded) {
        return decoded;
      }
    }
  }

  if (path.includes('redirect')) {
    for (const key of REDIRECT_QUERY_KEYS) {
      const value = url.searchParams.get(key);
      if (!value) continue;
      const decoded = safeParseUrl(decodeURIComponent(value)) ?? safeParseUrl(value);
      if (decoded) return decoded;
    }
  }

  return null;
}

function isSearchResultUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if ((host === 'www.google.com' || host === 'google.com') && path === '/search') {
    return true;
  }
  if (host === 'www.bing.com' && path === '/search') {
    return true;
  }
  if (host === 'search.yahoo.com' && path === '/search') {
    return true;
  }
  if (host === 'www.in.gov' && path === '/core/results') {
    return true;
  }
  return false;
}

export function canonicalizeDiscoveryUrl(rawUrl: string): string | null {
  const normalized = normalizeRawUrl(rawUrl);
  let parsed = safeParseUrl(normalized);
  if (!parsed) return null;

  for (let i = 0; i < 3; i += 1) {
    const unwrapped = maybeUnwrapRedirect(parsed);
    if (!unwrapped) break;
    parsed = unwrapped;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_DISCOVERY_HOSTS.has(hostname)) {
    return null;
  }
  if (isSearchResultUrl(parsed)) {
    return null;
  }

  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_QUERY_KEYS.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }
  if ([...parsed.searchParams.keys()].length === 0) {
    parsed.search = '';
  }
  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }

  return parsed.toString();
}

function extractUrlsFromText(rawText: string): string[] {
  const out: string[] = [];
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  for (const match of rawText.matchAll(urlRegex)) {
    if (match[0]) out.push(match[0]);
  }
  return out;
}

function parseJsonArray(text: string): unknown[] | null {
  const cleaned = stripCodeFence(text);
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    // Best-effort: parse first top-level JSON array if wrapped in prose.
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start < 0 || end <= start) {
      return null;
    }
    const slice = cleaned.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function parseJsonObjects(text: string): ParsedDiscoveryUrl[] {
  const parsedArray = parseJsonArray(text);
  if (!parsedArray) return [];

  const out: ParsedDiscoveryUrl[] = [];
  for (const item of parsedArray) {
    if (typeof item === 'string') {
      const canonical = canonicalizeDiscoveryUrl(item);
      if (!canonical) continue;
      out.push({
        url: canonical,
        title: canonical,
      });
      continue;
    }

    if (!item || typeof item !== 'object') continue;
    const record = item as JsonLikeRecord;
    const rawUrl = String(record.url ?? record.uri ?? record.link ?? record.href ?? '').trim();
    const canonical = canonicalizeDiscoveryUrl(rawUrl);
    if (!canonical) continue;

    const title = String(record.title ?? record.name ?? canonical).trim() || canonical;
    const sourceType = String(record.sourceType ?? record.type ?? '').trim() || undefined;
    out.push({
      url: canonical,
      title,
      sourceTypeHint: sourceType,
    });
  }

  return out;
}

export function extractDiscoveryUrlsFromGeminiCandidate(
  candidate: GeminiCandidateLike | null | undefined,
  maxResults = 8
): ParsedDiscoveryUrl[] {
  if (!candidate) return [];

  const out: ParsedDiscoveryUrl[] = [];
  const seen = new Set<string>();

  const add = (entry: ParsedDiscoveryUrl) => {
    if (seen.has(entry.url)) return;
    seen.add(entry.url);
    out.push(entry);
  };

  const parts = candidate.content?.parts ?? [];
  for (const part of parts) {
    if (typeof part.text !== 'string' || part.text.trim().length === 0) continue;

    for (const parsed of parseJsonObjects(part.text)) {
      add(parsed);
      if (out.length >= maxResults) return out;
    }

    for (const extractedUrl of extractUrlsFromText(part.text)) {
      const canonical = canonicalizeDiscoveryUrl(extractedUrl);
      if (!canonical) continue;
      add({ url: canonical, title: canonical });
      if (out.length >= maxResults) return out;
    }
  }

  const chunks = candidate.groundingMetadata?.groundingChunks ?? [];
  for (const chunk of chunks) {
    const raw = chunk.web?.uri?.trim();
    if (!raw) continue;
    const canonical = canonicalizeDiscoveryUrl(raw);
    if (!canonical) continue;
    add({
      url: canonical,
      title: chunk.web?.title?.trim() || canonical,
    });
    if (out.length >= maxResults) return out;
  }

  return out;
}

async function probeUrl(method: 'HEAD' | 'GET', url: string, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': DISCOVERY_VALIDATION_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8',
        ...(method === 'GET' ? { Range: 'bytes=0-8192' } : {}),
      },
    });
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveReachableDiscoveryUrl(rawUrl: string): Promise<string | null> {
  const canonical = canonicalizeDiscoveryUrl(rawUrl);
  if (!canonical) {
    return null;
  }

  const timeoutMs = Number(process.env.DISCOVERY_URL_VALIDATION_TIMEOUT_MS ?? 8_000);
  const head = await probeUrl('HEAD', canonical, timeoutMs);
  if (head) {
    if (head.ok || (head.status >= 300 && head.status < 400)) {
      return canonicalizeDiscoveryUrl(head.url) ?? canonical;
    }

    if (![405, 501].includes(head.status)) {
      return null;
    }
  }

  const get = await probeUrl('GET', canonical, timeoutMs);
  if (get?.ok || get?.status === 206) {
    return canonicalizeDiscoveryUrl(get.url) ?? canonical;
  }
  return null;
}

export async function filterReachableDiscoveryUrls(
  entries: ParsedDiscoveryUrl[],
  maxResults = 8
): Promise<ParsedDiscoveryUrl[]> {
  if (entries.length === 0) return [];

  const checks = await Promise.all(
    entries.map(async (entry) => {
      const reachable = await resolveReachableDiscoveryUrl(entry.url);
      if (!reachable) return null;
      return {
        ...entry,
        url: reachable,
      };
    })
  );

  const out: ParsedDiscoveryUrl[] = [];
  const seen = new Set<string>();
  for (const entry of checks) {
    if (!entry || seen.has(entry.url)) continue;
    seen.add(entry.url);
    out.push(entry);
    if (out.length >= maxResults) break;
  }
  return out;
}
