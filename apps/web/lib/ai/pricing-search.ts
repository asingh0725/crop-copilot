/**
 * Product pricing search using Gemini 2.0 Flash Lite
 * Provides on-demand pricing information based on user region
 */

import Anthropic from "@anthropic-ai/sdk";

export interface ProductPricing {
  price: number | null;
  unit: string;
  retailer: string;
  url: string | null;
  region: string;
  lastUpdated: Date;
}

export interface PricingSearchOptions {
  productName: string;
  brand?: string;
  region?: string;
  maxResults?: number;
}

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is a rate limit error
 */
function isRateLimitError(status: number): boolean {
  return status === 429 || status === 503;
}

function isAnthropicRateLimitError(error: unknown): boolean {
  if (error instanceof Anthropic.RateLimitError) {
    return true;
  }
  if (error instanceof Error) {
    const lowered = error.message.toLowerCase();
    return lowered.includes("rate limit") || lowered.includes("429");
  }
  return false;
}

/**
 * Search for product pricing using Gemini 2.0 Flash Lite with Google Search grounding
 */
export async function searchProductPricing(
  options: PricingSearchOptions
): Promise<ProductPricing[]> {
  const {
    productName,
    brand,
    region = "United States",
    maxResults = 5,
  } = options;

  const prompt = buildPricingPrompt({ productName, brand, region, maxResults });

  const geminiResults = await searchWithGemini(prompt, region);
  if (geminiResults.length > 0) {
    return geminiResults.slice(0, maxResults);
  }

  const anthropicResults = await searchWithAnthropic(prompt, region);
  if (anthropicResults.length > 0) {
    return anthropicResults.slice(0, maxResults);
  }

  return [];
}

function buildPricingPrompt(options: {
  productName: string;
  brand?: string;
  region: string;
  maxResults: number;
}): string {
  const { productName, brand, region, maxResults } = options;
  const searchTerm = brand ? `${brand} ${productName}` : productName;
  const normalizedRegion = region.toLowerCase();

  // Determine country/region context for better retailer targeting
  const isCanada =
    normalizedRegion.includes("canada") ||
    [
      "british columbia",
      "alberta",
      "ontario",
      "quebec",
      "manitoba",
      "saskatchewan",
      "nova scotia",
      "new brunswick",
      "newfoundland",
      "pei",
      "yukon",
      "nunavut",
      "northwest territories",
      "bc",
      "ab",
      "on",
      "qc",
      "mb",
      "sk",
      "ns",
      "nb",
      "nl",
      "nt",
      "yt",
      "nu",
    ].some((prov) => normalizedRegion.includes(prov));

  const regionContext = isCanada
    ? `Canadian retailers only. Use .ca domains (for example homedepot.ca, amazon.ca, canadiantire.ca). Do NOT use .com domains for US retailers.`
    : `Retailers serving ${region}. Use regionally appropriate domains.`;

  const retailerExamples = isCanada
    ? `Canadian retailers like: Peavey Mart, Home Hardware, Canadian Tire, Home Depot Canada (homedepot.ca), Amazon Canada (amazon.ca), UFA, Co-op Agro, Richardson Pioneer, Nutrien Ag Solutions Canada`
    : `Agricultural retailers like: Nutrien Ag Solutions, Helena, FBN, Tractor Supply, Amazon, Home Depot, and local farm supply stores`;

  return `Find current retail prices for this agricultural product: "${searchTerm}"

IMPORTANT - User Location: ${region}
${regionContext}

Search for prices ONLY from ${retailerExamples}.

Requirements:
- Prices must be in local currency (${isCanada ? "CAD" : "local currency"})
- URLs must be for retailers that ship to ${region}
- ${isCanada ? "ONLY use Canadian websites (.ca domains). Never use American .com sites." : "Use regionally appropriate websites."}

Return ONLY a valid JSON array with up to ${maxResults} pricing results. Format:
[
  {
    "price": 45.99,
    "unit": "50 lb bag",
    "retailer": "Retailer Name",
    "url": "https://example${isCanada ? ".ca" : ".com"}/product",
    "region": "${region}"
  }
]

If no pricing is found for ${region}, return an empty array: []
Important: only include real prices from retailers that actually serve ${region}.`;
}

async function searchWithGemini(
  prompt: string,
  region: string
): Promise<ProductPricing[]> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn("[Pricing] GOOGLE_AI_API_KEY not configured, trying Claude fallback");
    return [];
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            tools: [
              {
                google_search: {},
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2048,
            },
          }),
        }
      );

      if (!response.ok) {
        if (isRateLimitError(response.status) && attempt < MAX_RETRIES - 1) {
          const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.log(
            `[Pricing] Rate limit hit, retrying in ${backoffMs / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`
          );
          await sleep(backoffMs);
          continue;
        }
        throw new Error(
          `Gemini API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Extract text from response
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      return parsePricingFromResponse(text, region);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < MAX_RETRIES - 1) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.log(
          `[Pricing] Error occurred, retrying in ${backoffMs / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(backoffMs);
      }
    }
  }

  console.error("[Pricing] Search failed after retries:", lastError);
  return [];
}

async function searchWithAnthropic(
  prompt: string,
  region: string
): Promise<ProductPricing[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? null;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN ?? null;
  if (!apiKey && !authToken) {
    console.warn("[Pricing] Anthropic credentials unavailable for pricing fallback");
    return [];
  }
  const anthropic = new Anthropic({
    apiKey: apiKey ?? undefined,
    authToken: authToken ?? undefined,
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_PRICING_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 1600,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 2,
          },
        ],
        messages: [{ role: "user", content: prompt }],
      });

      let responseText = "";
      for (const block of response.content) {
        if (block.type === "text") {
          responseText += block.text;
        }
      }

      return parsePricingFromResponse(responseText, region);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isAnthropicRateLimitError(error) && attempt < MAX_RETRIES - 1) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.log(
          `[Pricing] Claude rate limit hit, retrying in ${backoffMs / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(backoffMs);
        continue;
      }

      if (attempt < MAX_RETRIES - 1) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.log(
          `[Pricing] Claude search error, retrying in ${backoffMs / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(backoffMs);
      }
    }
  }

  console.error("[Pricing] Claude fallback failed after retries:", lastError);
  return [];
}

/**
 * Parse pricing information from Gemini response
 */
function parsePricingFromResponse(
  text: string,
  region: string
): ProductPricing[] {
  try {
    // Find JSON array in response
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => {
        const p =
          typeof item.price === "number"
            ? item.price
            : parseFloat(String(item.price));
        return Number.isFinite(p);
      })
      .map((item: Record<string, unknown>) => {
        const parsedPrice =
          typeof item.price === "number"
            ? item.price
            : typeof item.price === "string"
              ? parseFloat(item.price.replace(/[^0-9.]/g, ""))
              : NaN;

        return {
          price: Number.isFinite(parsedPrice) ? parsedPrice : null,
          unit: String(item.unit || "each"),
          retailer: String(item.retailer || "Unknown"),
          url: item.url ? String(item.url) : null,
          region: String(item.region || region),
          lastUpdated: new Date(),
        };
      })
      .slice(0, 5); // Ensure max 5 results
  } catch (error) {
    console.error("[Pricing] Failed to parse response:", error);
    return [];
  }
}
