/**
 * Live product pricing search using Gemini 2.0 Flash with Google Search grounding.
 */

export interface PricingOffer {
  price: number | null;
  unit: string;
  retailer: string;
  url: string | null;
  region: string;
  lastUpdated: string; // ISO string
}

export interface PricingSearchOptions {
  productName: string;
  brand?: string | null;
  region?: string;
  maxResults?: number;
}

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const DEFAULT_REGION = 'United States';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPricingPrompt(options: {
  productName: string;
  brand?: string | null;
  region: string;
  maxResults: number;
}): string {
  const { productName, brand, region, maxResults } = options;
  const searchTerm = brand ? `${brand} ${productName}` : productName;
  const normalizedRegion = region.toLowerCase();

  const isCanada =
    normalizedRegion.includes('canada') ||
    ['british columbia','alberta','ontario','quebec','manitoba','saskatchewan',
     'nova scotia','new brunswick','newfoundland','pei','yukon','nunavut',
     'northwest territories','bc','ab','on','qc','mb','sk','ns','nb','nl','nt','yt','nu',
    ].some((prov) => normalizedRegion.includes(prov));

  const regionContext = isCanada
    ? `Canadian retailers only. Use .ca domains. Do NOT use .com US retailer domains.`
    : `Retailers serving ${region}. Use regionally appropriate domains.`;

  const retailerExamples = isCanada
    ? `Peavey Mart, Home Hardware, Canadian Tire, Home Depot Canada, Amazon Canada, UFA, Co-op Agro, Richardson Pioneer, Nutrien Ag Solutions Canada`
    : `Nutrien Ag Solutions, Helena, FBN, Tractor Supply, Amazon, Home Depot, and local farm supply stores`;

  return `Find current retail prices for this agricultural product: "${searchTerm}"

IMPORTANT - User Location: ${region}
${regionContext}

Search for prices ONLY from ${retailerExamples}.

Requirements:
- Prices must be in local currency (${isCanada ? 'CAD' : 'local currency'})
- URLs must be for retailers that ship to ${region}
- ${isCanada ? 'ONLY use Canadian websites (.ca domains). Never use American .com sites.' : 'Use regionally appropriate websites.'}

Return ONLY a valid JSON array with up to ${maxResults} pricing results. Format:
[
  {
    "price": 45.99,
    "unit": "50 lb bag",
    "retailer": "Retailer Name",
    "url": "https://example.${isCanada ? 'ca' : 'com'}/product",
    "region": "${region}"
  }
]

If no pricing is found for ${region}, return an empty array: []
Important: only include real prices from retailers that actually serve ${region}.`;
}

function parsePricingFromResponse(text: string, region: string): PricingOffer[] {
  try {
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const now = new Date().toISOString();
    return parsed
      .filter((item) => {
        const p = typeof item.price === 'number' ? item.price : parseFloat(String(item.price));
        return Number.isFinite(p);
      })
      .map((item: Record<string, unknown>): PricingOffer => {
        const rawPrice =
          typeof item.price === 'number'
            ? item.price
            : typeof item.price === 'string'
              ? parseFloat(item.price.replace(/[^0-9.]/g, ''))
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
      .slice(0, 5);
  } catch {
    return [];
  }
}

export async function searchLivePricing(options: PricingSearchOptions): Promise<PricingOffer[]> {
  const { productName, brand, region = DEFAULT_REGION, maxResults = 5 } = options;

  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[Pricing] No GOOGLE_AI_API_KEY — skipping live pricing search');
    return [];
  }

  const prompt = buildPricingPrompt({ productName, brand, region, maxResults });
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if ((status === 429 || status === 503) && attempt < MAX_RETRIES - 1) {
          await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`Gemini API error: ${status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const responseText = parts.map((p) => p.text ?? '').join('');

      const results = parsePricingFromResponse(responseText, region);
      if (results.length > 0) return results;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES - 1) {
        await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
      }
    }
  }

  console.error('[Pricing] Live search failed after retries:', lastError?.message);
  return [];
}
