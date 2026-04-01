/**
 * Live product pricing search.
 *
 * Provider selection via PRICING_SEARCH_PROVIDER env var:
 *   "brave"       (default) — Brave Search API + deterministic extraction (single paid call)
 *   "perplexity"            — Perplexity sonar
 *   "gemini"                — Gemini + Google Search grounding, ~$0.035/product (original)
 *
 * Required keys per provider:
 *   brave:      BRAVE_SEARCH_API_KEY
 *   perplexity: PERPLEXITY_API_KEY
 *   gemini:     GOOGLE_AI_API_KEY
 */

export interface PricingOffer {
  price: number | null;
  unit: string;
  retailer: string;
  url: string | null;
  region: string;
  lastUpdated: string;
}

export interface PricingSearchOptions {
  productName: string;
  brand?: string | null;
  region?: string;
  maxResults?: number;
}

const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 800;
const DEFAULT_REGION = 'United States';
const DEFAULT_BRAVE_RESULT_COUNT = 6;
const DEFAULT_PAGE_FETCH_LIMIT = 2;
const DEFAULT_PAGE_FETCH_TIMEOUT_MS = 4_000;
const BLOCKED_HOST_PATTERNS = [
  'wikipedia.org',
  'youtube.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'x.com',
  'twitter.com',
  'reddit.com',
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function isCanadaRegion(region: string): boolean {
  const n = region.toLowerCase();
  return (
    n.includes('canada') ||
    ['british columbia','alberta','ontario','quebec','manitoba','saskatchewan',
     'nova scotia','new brunswick','newfoundland','pei','yukon','nunavut',
     'northwest territories','bc','ab','on','qc','mb','sk','ns','nb','nl','nt','yt','nu',
    ].some((prov) => n.includes(prov))
  );
}

function buildRetailerList(isCanada: boolean): string {
  return isCanada
    ? 'Peavey Mart, UFA, Co-op Agro, Richardson Pioneer, Nutrien Ag Solutions Canada, Amazon Canada'
    : 'Nutrien Ag Solutions, Helena Agri-Enterprises, FBN, Tractor Supply, Amazon';
}

function normalizeUrl(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') {
      return null;
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function isBlockedHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return BLOCKED_HOST_PATTERNS.some((pattern) => host.includes(pattern));
  } catch {
    return true;
  }
}

function extractPriceValues(text: string): number[] {
  const matches = [...text.matchAll(/(?:c\$|cad\s*|usd\s*|\$)\s*([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/gi)];
  const values = matches
    .map((match) => Number(match[1]?.replace(/,/g, '') ?? ''))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 100_000);
  return [...new Set(values)];
}

function extractUnit(text: string): string {
  const unitMatch = text.match(
    /\b(\d+(?:\.\d+)?\s?(?:gal(?:lon)?|oz|lb|lbs|kg|g|l|lt|liter|litre|qt|quart|pt|pint|bag|jug|pack|ct|count|bottle|each))\b/i
  );
  return unitMatch?.[1]?.trim() ?? 'each';
}

function normalizeRetailerName(rawTitle: string, url: string): string {
  const titlePrefix = rawTitle.split(/[|\-:]/)[0]?.trim();
  if (titlePrefix && titlePrefix.length >= 3) {
    return titlePrefix;
  }

  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const base = host.split('.').slice(0, -1).join('.');
    return base.length > 0 ? base : host;
  } catch {
    return 'Unknown';
  }
}

function dedupeOffers(offers: PricingOffer[], maxResults: number): PricingOffer[] {
  const seen = new Set<string>();
  const deduped: PricingOffer[] = [];

  for (const offer of offers) {
    const key = `${offer.retailer.toLowerCase()}|${offer.url ?? ''}|${offer.price ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(offer);
    if (deduped.length >= maxResults) {
      break;
    }
  }

  return deduped.sort((a, b) => (a.price ?? Number.MAX_VALUE) - (b.price ?? Number.MAX_VALUE));
}

interface BraveSearchResult {
  title?: string;
  description?: string;
  url?: string;
}

function buildOfferFromText(params: {
  title: string;
  description: string;
  url: string;
  region: string;
}): PricingOffer | null {
  const combined = `${params.title} ${params.description}`;
  const prices = extractPriceValues(combined);
  if (prices.length === 0) {
    return null;
  }

  return {
    price: prices[0] ?? null,
    unit: extractUnit(combined),
    retailer: normalizeRetailerName(params.title, params.url),
    url: params.url,
    region: params.region,
    lastUpdated: new Date().toISOString(),
  };
}

async function fetchPagePricing(
  url: string,
  region: string,
  fallbackTitle: string
): Promise<PricingOffer | null> {
  const timeoutMs = parsePositiveInt(
    process.env.PRICING_PAGE_FETCH_TIMEOUT_MS,
    DEFAULT_PAGE_FETCH_TIMEOUT_MS
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CropCopilotPricingBot/1.0 (+https://www.cropcopilot.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      return null;
    }

    const html = (await response.text()).slice(0, 250_000);
    const metaPrice =
      html.match(/property=["']product:price:amount["'][^>]*content=["']([0-9.,]+)["']/i)?.[1] ??
      html.match(/"price"\s*:\s*"([0-9.,]+)"/i)?.[1] ??
      html.match(/"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1] ??
      null;

    const fallbackPrice = extractPriceValues(html)[0] ?? null;
    const normalizedPrice = Number((metaPrice ?? '').replace(/,/g, ''));
    const price =
      Number.isFinite(normalizedPrice) && normalizedPrice > 0 ? normalizedPrice : fallbackPrice;
    if (!price) {
      return null;
    }

    return {
      price,
      unit: extractUnit(html),
      retailer: normalizeRetailerName(fallbackTitle, url),
      url,
      region,
      lastUpdated: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parsePricingFromText(text: string, region: string, maxResults: number): PricingOffer[] {
  try {
    // Try to extract a JSON array from anywhere in the response
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const now = new Date().toISOString();
    return parsed
      .filter((item) => {
        const p = typeof item.price === 'number' ? item.price : parseFloat(String(item.price));
        return Number.isFinite(p) && p > 0;
      })
      .map((item: Record<string, unknown>): PricingOffer => {
        const rawPrice =
          typeof item.price === 'number'
            ? item.price
            : typeof item.price === 'string'
              ? parseFloat((item.price as string).replace(/[^0-9.]/g, ''))
              : NaN;
        return {
          price: Number.isFinite(rawPrice) ? rawPrice : null,
          unit: String(item.unit || 'each'),
          retailer: String(item.retailer || 'Unknown'),
          url: item.url ? String(item.url) : null,
          region: String(item.region || region),
          lastUpdated: now,
        };
      })
      .slice(0, maxResults);
  } catch {
    return [];
  }
}

function buildPricingPrompt(options: {
  productName: string;
  brand?: string | null;
  region: string;
  maxResults: number;
}): string {
  const { productName, brand, region, maxResults } = options;
  const searchTerm = brand ? `${brand} ${productName}` : productName;
  const isCanada = isCanadaRegion(region);
  const retailers = buildRetailerList(isCanada);
  const domainHint = isCanada ? '.ca domains only, no .com US sites' : 'regionally appropriate domains';
  const currency = isCanada ? 'CAD' : 'USD';

  return `Find current retail prices for this agricultural product: "${searchTerm}"

User region: ${region}. Search ${retailers}. Use ${domainHint}.

Return ONLY a JSON array (no prose) with up to ${maxResults} results:
[
  { "price": 45.99, "unit": "2.5 gal jug", "retailer": "Retailer Name", "url": "https://...", "region": "${region}" }
]

Requirements: real prices in ${currency}, real retailer URLs that ship to ${region}, no duplicates.
If no real prices are found, return: []`;
}

// ─── Provider: Perplexity sonar ────────────────────────────────────────────────
// ~$0.006/call (low search context $5/1K requests + $1/1M tokens)

async function searchWithPerplexity(
  options: PricingSearchOptions,
  apiKey: string
): Promise<PricingOffer[]> {
  const { productName, brand, region = DEFAULT_REGION, maxResults = 5 } = options;
  const prompt = buildPricingPrompt({ productName, brand, region, maxResults });
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: prompt }],
          // Low search context = $5/1K requests (vs medium $8/1K or high $12/1K)
          search_context_size: 'low',
          max_tokens: 600,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if ((status === 429 || status === 503) && attempt < MAX_RETRIES - 1) {
          await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`Perplexity API error: ${status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const text = data.choices?.[0]?.message?.content ?? '';
      const results = parsePricingFromText(text, region, maxResults);
      return results;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES - 1) {
        await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
      }
    }
  }

  console.error('[Pricing:perplexity] Failed after retries:', lastError?.message);
  return [];
}

// ─── Provider: Brave Search API + deterministic extraction ────────────────────
// One paid Brave request, then optional free page fetches for price extraction.

async function searchWithBrave(
  options: PricingSearchOptions,
  braveKey: string
): Promise<PricingOffer[]> {
  const { productName, brand, region = DEFAULT_REGION, maxResults = 5 } = options;
  const searchTerm = brand ? `${brand} ${productName}` : productName;
  const isCanada = isCanadaRegion(region);
  const query = `"${searchTerm}" price buy ${isCanada ? 'canada' : 'usa'} ${isCanada ? 'site:.ca OR canada' : 'site:.com OR usa'}`.trim();
  const braveResultCount = parsePositiveInt(
    process.env.PRICING_BRAVE_RESULT_COUNT,
    DEFAULT_BRAVE_RESULT_COUNT
  );

  let results: BraveSearchResult[] = [];
  try {
    const braveResponse = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${braveResultCount}&search_lang=en&country=${isCanada ? 'ca' : 'us'}`,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': braveKey,
        },
      }
    );

    if (!braveResponse.ok) {
      throw new Error(`Brave API error: ${braveResponse.status} ${braveResponse.statusText}`);
    }

    const braveData = (await braveResponse.json()) as {
      web?: { results?: BraveSearchResult[] };
    };
    results = braveData.web?.results ?? [];
  } catch (err) {
    console.warn('[Pricing:brave] Search request failed:', (err as Error).message);
    return [];
  }

  const offers: PricingOffer[] = [];
  const unresolved: Array<{ url: string; title: string }> = [];

  for (const result of results) {
    const url = normalizeUrl(result.url);
    if (!url || isBlockedHost(url)) {
      continue;
    }

    const title = (result.title ?? '').trim();
    const description = (result.description ?? '').trim();
    const offer = buildOfferFromText({ title, description, url, region });
    if (offer) {
      offers.push(offer);
      if (offers.length >= maxResults) {
        return dedupeOffers(offers, maxResults);
      }
      continue;
    }

    unresolved.push({ url, title });
  }

  const pageFetchLimit = parsePositiveInt(
    process.env.PRICING_PAGE_FETCH_LIMIT,
    DEFAULT_PAGE_FETCH_LIMIT
  );
  for (const result of unresolved.slice(0, pageFetchLimit)) {
    const offer = await fetchPagePricing(result.url, region, result.title);
    if (!offer) {
      continue;
    }
    offers.push(offer);
    if (offers.length >= maxResults) {
      break;
    }
  }

  return dedupeOffers(offers, maxResults);
}

// ─── Provider: Gemini + Google Search grounding (legacy) ──────────────────────
// ~$0.035/call due to Google Search grounding fee ($35/1K requests)

async function searchWithGemini(
  options: PricingSearchOptions,
  apiKey: string
): Promise<PricingOffer[]> {
  const { productName, brand, region = DEFAULT_REGION, maxResults = 5 } = options;
  const model = process.env.GEMINI_PRICING_MODEL?.trim() || 'gemini-2.5-flash';
  const prompt = buildPricingPrompt({ productName, brand, region, maxResults });
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
          }),
        }
      );

      if (!response.ok) {
        const status = response.status;
        if ((status === 429 || status === 503) && attempt < MAX_RETRIES - 1) {
          await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`Gemini API error (${model}): ${status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p) => p.text ?? '').join('');
      return parsePricingFromText(text, region, maxResults);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES - 1) {
        await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
      }
    }
  }

  console.error('[Pricing:gemini] Failed after retries:', lastError?.message);
  return [];
}

// ─── Public entry point ────────────────────────────────────────────────────────

export async function searchLivePricing(options: PricingSearchOptions): Promise<PricingOffer[]> {
  const provider = (process.env.PRICING_SEARCH_PROVIDER ?? 'brave').toLowerCase();
  const perplexityKey = process.env.PERPLEXITY_API_KEY?.trim();
  const geminiKey = process.env.GOOGLE_AI_API_KEY?.trim();

  if (provider === 'brave') {
    const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
    if (!braveKey) {
      console.warn('[Pricing] BRAVE_SEARCH_API_KEY missing — falling back to configured secondary provider');
      if (perplexityKey) {
        return searchWithPerplexity(options, perplexityKey);
      }
      if (geminiKey) {
        return searchWithGemini(options, geminiKey);
      }
      return [];
    }
    return searchWithBrave(options, braveKey);
  }

  if (provider === 'gemini') {
    if (!geminiKey) {
      console.warn('[Pricing] No GOOGLE_AI_API_KEY — skipping');
      return [];
    }
    return searchWithGemini(options, geminiKey);
  }

  // Default: perplexity sonar
  if (!perplexityKey) {
    console.warn('[Pricing] No PERPLEXITY_API_KEY — skipping live pricing search');
    return [];
  }
  return searchWithPerplexity(options, perplexityKey);
}
