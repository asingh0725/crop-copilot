/**
 * Live product pricing search.
 *
 * Provider selection via PRICING_SEARCH_PROVIDER env var:
 *   "perplexity"  (default) — Perplexity sonar, ~$0.006/product (6× cheaper than Gemini grounding)
 *   "brave"                 — Brave Search + Claude Haiku, ~$0.005/product (7× cheaper)
 *   "gemini"                — Gemini + Google Search grounding, ~$0.035/product (original)
 *
 * Required keys per provider:
 *   perplexity: PERPLEXITY_API_KEY
 *   brave:      BRAVE_SEARCH_API_KEY + ANTHROPIC_API_KEY
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// ─── Provider: Brave Search + Claude Haiku ────────────────────────────────────
// ~$0.0055/call (Brave Search $5/1K + Haiku ~$0.0005 for extraction)

async function searchWithBrave(
  options: PricingSearchOptions,
  braveKey: string,
  anthropicKey: string
): Promise<PricingOffer[]> {
  const { productName, brand, region = DEFAULT_REGION, maxResults = 5 } = options;
  const searchTerm = brand ? `${brand} ${productName}` : productName;
  const isCanada = isCanadaRegion(region);
  const retailers = buildRetailerList(isCanada);

  // Step 1: Brave Search — targeted query for product pricing
  const query = `"${searchTerm}" price buy ${isCanada ? 'canada' : 'USA'} ${isCanada ? 'site:ca' : ''}`.trim();
  let snippets: string[] = [];

  try {
    const braveResponse = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8&search_lang=en&country=${isCanada ? 'ca' : 'us'}`,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': braveKey,
        },
      }
    );

    if (braveResponse.ok) {
      const braveData = (await braveResponse.json()) as {
        web?: { results?: Array<{ title?: string; description?: string; url?: string }> };
      };
      snippets = (braveData.web?.results ?? [])
        .slice(0, 8)
        .map((r) => `Title: ${r.title ?? ''}\nURL: ${r.url ?? ''}\nSnippet: ${r.description ?? ''}`)
        .filter((s) => s.length > 20);
    }
  } catch (err) {
    console.warn('[Pricing:brave] Search request failed:', (err as Error).message);
    return [];
  }

  if (snippets.length === 0) return [];

  // Step 2: Haiku — extract structured pricing from snippets
  const extractionPrompt = `You are extracting retail prices for "${searchTerm}" from web search snippets.
Preferred retailers: ${retailers}.
Region: ${region}. Currency: ${isCanada ? 'CAD' : 'USD'}.

Search snippets:
${snippets.join('\n---\n')}

Extract up to ${maxResults} real retail prices. Return ONLY a JSON array:
[{ "price": 45.99, "unit": "2.5 gal", "retailer": "Name", "url": "https://...", "region": "${region}" }]
If no real prices appear in the snippets, return: []`;

  try {
    const haikuResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: extractionPrompt }],
      }),
    });

    if (!haikuResponse.ok) {
      throw new Error(`Haiku extraction error: ${haikuResponse.status}`);
    }

    const haikuData = (await haikuResponse.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = haikuData.content?.find((b) => b.type === 'text')?.text ?? '';
    return parsePricingFromText(text, region, maxResults);
  } catch (err) {
    console.error('[Pricing:brave] Haiku extraction failed:', (err as Error).message);
    return [];
  }
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
  const provider = (process.env.PRICING_SEARCH_PROVIDER ?? 'perplexity').toLowerCase();

  if (provider === 'brave') {
    const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!braveKey || !anthropicKey) {
      console.warn('[Pricing] BRAVE_SEARCH_API_KEY or ANTHROPIC_API_KEY missing — skipping');
      return [];
    }
    return searchWithBrave(options, braveKey, anthropicKey);
  }

  if (provider === 'gemini') {
    const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
    if (!apiKey) {
      console.warn('[Pricing] No GOOGLE_AI_API_KEY — skipping');
      return [];
    }
    return searchWithGemini(options, apiKey);
  }

  // Default: perplexity sonar
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[Pricing] No PERPLEXITY_API_KEY — skipping live pricing search');
    return [];
  }
  return searchWithPerplexity(options, apiKey);
}
