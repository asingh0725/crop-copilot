import Anthropic from "@anthropic-ai/sdk";
import { ProductType } from "@prisma/client";

// Retry configuration for rate limits
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1200;
const MAX_BACKOFF_MS = 6000;

/**
 * Helper to check if error is a rate limit error
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Anthropic.RateLimitError) {
    return true;
  }
  if (error instanceof Error) {
    return error.message.includes("rate limit") ||
           error.message.includes("429") ||
           error.message.includes("too many requests");
  }
  return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic for rate limits
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (isRateLimitError(error) && attempt < MAX_RETRIES - 1) {
        const backoffMs = Math.min(
          INITIAL_BACKOFF_MS * Math.pow(2, attempt),
          MAX_BACKOFF_MS
        );
        console.log(
          `[${context}] Rate limit hit, retrying in ${backoffMs / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(backoffMs);
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

// Types for product search results
export interface ProductSearchResult {
  name: string;
  brand: string | null;
  type: ProductType;
  analysis: Record<string, number | string> | null;
  applicationRate: string | null;
  crops: string[];
  description: string | null;
  searchQuery: string;
}

export interface ProductSearchOptions {
  diagnosis: string;
  crop?: string;
  location?: string;
  maxProducts?: number;
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Search for recommended products using Claude's web search capability
 */
export async function searchRecommendedProducts(
  options: ProductSearchOptions
): Promise<ProductSearchResult[]> {
  const { diagnosis, crop, location, maxProducts = 3 } = options;

  const searchQuery = buildSearchQuery(diagnosis, crop, location);

  const systemPrompt = `You are an agricultural product research assistant. Your task is to find specific fertilizers, pesticides, or agricultural products that would help address the given plant diagnosis.

When searching, focus on:
1. Products that directly address the diagnosed issue
2. Products available from major agricultural retailers (Nutrien Ag Solutions, Helena Agri-Enterprises, FBN, etc.)
3. Products appropriate for the specified crop (if provided)
4. Both synthetic and organic options when applicable

For each product found, extract:
- Exact product name and brand
- Product type (FERTILIZER, AMENDMENT, PESTICIDE, HERBICIDE, FUNGICIDE, INSECTICIDE, SEED_TREATMENT, BIOLOGICAL, OTHER)
- NPK analysis or active ingredient percentages
- Recommended application rate
- Compatible crops
- Brief description

Return your findings as a JSON array.`;

  const userPrompt = `Find ${maxProducts} agricultural products that would help address this plant diagnosis:

Diagnosis: ${diagnosis}
${crop ? `Crop: ${crop}` : ""}
${location ? `Location: ${location}` : ""}

Search for specific products with real names and brands.

Return ONLY a valid JSON array with this structure (no additional text):
[
  {
    "name": "Product Name",
    "brand": "Brand Name or null",
    "type": "FERTILIZER|AMENDMENT|PESTICIDE|HERBICIDE|FUNGICIDE|INSECTICIDE|SEED_TREATMENT|BIOLOGICAL|OTHER",
    "analysis": {"N": 10, "P": 10, "K": 10} or {"activeIngredient": "25%"} or null,
    "applicationRate": "5 lbs per acre" or null,
    "crops": ["corn", "soybeans"],
    "description": "Brief product description"
  }
]`;

  try {
    const response = await withRetry(
      () =>
        anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1800,
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 2,
            },
          ],
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: userPrompt,
            },
          ],
        }),
      "Product Search"
    );

    // Extract text content from response
    let responseText = "";
    for (const block of response.content) {
      if (block.type === "text") {
        responseText += block.text;
      }
    }

    // Parse JSON from response
    const products = parseProductsFromResponse(responseText);

    // Add search query to each result
    return products.map((product) => ({
      ...product,
      searchQuery,
    }));
  } catch (error) {
    console.error("Product search error:", error);
    throw new Error("Failed to search for products");
  }
}

/**
 * Build search query from diagnosis and context
 */
function buildSearchQuery(
  diagnosis: string,
  crop?: string,
  location?: string
): string {
  const parts = [diagnosis];
  if (crop) parts.push(`for ${crop}`);
  if (location) parts.push(`in ${location}`);
  return parts.join(" ");
}

/**
 * Parse products from LLM response
 */
function parseProductsFromResponse(text: string): ProductSearchResult[] {
  try {
    // Find JSON array in response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("No JSON array found in response");
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.error("Parsed result is not an array");
      return [];
    }

    return parsed.map((item: Record<string, unknown>) =>
      normalizeProductResult(item)
    );
  } catch (error) {
    console.error("Failed to parse products from response:", error);
    return [];
  }
}

/**
 * Normalize product result to consistent format
 */
function normalizeProductResult(
  item: Record<string, unknown>
): ProductSearchResult {
  // Normalize product type
  const rawType = String(item.type || "OTHER").toUpperCase();
  const validTypes: ProductType[] = [
    "FERTILIZER",
    "AMENDMENT",
    "PESTICIDE",
    "HERBICIDE",
    "FUNGICIDE",
    "INSECTICIDE",
    "SEED_TREATMENT",
    "BIOLOGICAL",
    "OTHER",
  ];
  const type = validTypes.includes(rawType as ProductType)
    ? (rawType as ProductType)
    : "OTHER";

  // Normalize crops array
  let crops: string[] = [];
  if (Array.isArray(item.crops)) {
    crops = item.crops.map((c) => String(c).toLowerCase());
  } else if (typeof item.crops === "string") {
    crops = item.crops.split(",").map((c) => c.trim().toLowerCase());
  }

  return {
    name: String(item.name || "Unknown Product"),
    brand: item.brand ? String(item.brand) : null,
    type,
    analysis: (item.analysis as Record<string, number | string>) || null,
    applicationRate: item.applicationRate
      ? String(item.applicationRate)
      : null,
    crops,
    description: item.description ? String(item.description) : null,
    searchQuery: "",
  };
}
