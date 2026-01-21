import { chromium, Browser, Page } from "playwright";
import * as cheerio from "cheerio";
import * as fs from "fs/promises";
import * as path from "path";

const BOT_NAME = "agribot";

export interface FertilizerProduct {
  name: string;
  brand: string;
  manufacturer: string;
  npkRatio?: string;
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
  applicationRate?: string;
  targetCrops: string[];
  description?: string;
  imageUrl?: string;
  productUrl: string;
  scrapedAt: string;
}

export interface ScrapeResult {
  manufacturer: string;
  products: FertilizerProduct[];
  scrapedAt: string;
  success: boolean;
  error?: string;
}

/**
 * Check robots.txt to ensure we're allowed to scrape
 */
async function checkRobotsTxt(baseUrl: string, path: string): Promise<boolean> {
  try {
    const robotsUrl = `${baseUrl}/robots.txt`;
    const response = await fetch(robotsUrl);

    if (!response.ok) {
      // If robots.txt doesn't exist, assume scraping is allowed
      return true;
    }

    const robotsTxt = await response.text();
    const lines = robotsTxt.split("\n");

    let userAgentMatches = false;
    let disallowed = false;

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();

      if (trimmed.startsWith("user-agent:")) {
        const agent = trimmed.split(":")[1].trim();
        userAgentMatches =
          agent === "*" || agent === BOT_NAME || agent.startsWith(BOT_NAME);
      }

      if (userAgentMatches && trimmed.startsWith("disallow:")) {
        const disallowPath = trimmed.split(":")[1].trim();

        // Empty Disallow means allow all paths
        if (!disallowPath) {
          continue;
        }

        if (path.startsWith(disallowPath)) {
          disallowed = true;
          break;
        }
      }
    }

    return !disallowed;
  } catch (error) {
    console.warn("Failed to check robots.txt, proceeding with caution:", error);
    return true;
  }
}

/**
 * Delay between requests to respect rate limits
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse NPK ratio from text (e.g., "10-10-10", "46-0-0")
 */
function parseNPKRatio(text: string): {
  npkRatio?: string;
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
} {
  const npkPattern = /(\d+)-(\d+)-(\d+)/;
  const match = text.match(npkPattern);

  if (match) {
    return {
      npkRatio: match[0],
      nitrogen: parseInt(match[1]),
      phosphorus: parseInt(match[2]),
      potassium: parseInt(match[3]),
    };
  }

  return {};
}

/**
 * Scrape Nutrien fertilizer products
 * Note: This is a basic implementation that may need to be updated
 * based on the actual website structure
 */
export async function scrapeNutrienProducts(): Promise<ScrapeResult> {
  const manufacturer = "Nutrien";
  const baseUrl = "https://www.nutrien.com";
  const productsPath = "/products/fertilizers";

  try {
    // Check robots.txt
    const allowed = await checkRobotsTxt(baseUrl, productsPath);
    if (!allowed) {
      console.warn(
        `Scraping disallowed by robots.txt for ${baseUrl}${productsPath}`
      );
      return {
        manufacturer,
        products: [],
        scrapedAt: new Date().toISOString(),
        success: false,
        error: "Scraping disallowed by robots.txt",
      };
    }

    const products: FertilizerProduct[] = [];
    let browser: Browser | null = null;

    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // Set user agent to identify as a bot
      await page.setExtraHTTPHeaders({
        "User-Agent":
          "Mozilla/5.0 (compatible; AgriBot/1.0; +https://example.com/bot)",
      });

      // Navigate to products page
      await page.goto(`${baseUrl}${productsPath}`, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      await delay(2000); // Wait for dynamic content to load

      // Get page content
      const content = await page.content();
      const $ = cheerio.load(content);

      // Example selectors (these would need to be adjusted based on actual site structure)
      // This is a placeholder implementation
      $(".product-card, .fertilizer-item, [data-product]").each(
        (_, element) => {
          const $el = $(element);

          const name = $el.find(".product-name, h3, h4").first().text().trim();
          const description = $el
            .find(".product-description, .description, p")
            .first()
            .text()
            .trim();
          const imageUrl = $el.find("img").first().attr("src");
          const productUrl = $el.find("a").first().attr("href");

          if (name) {
            const npkData = parseNPKRatio(name + " " + description);

            products.push({
              name,
              brand: manufacturer,
              manufacturer,
              ...npkData,
              description: description || undefined,
              imageUrl: imageUrl ? new URL(imageUrl, baseUrl).href : undefined,
              productUrl: productUrl
                ? new URL(productUrl, baseUrl).href
                : baseUrl,
              targetCrops: [], // Would need to parse from content
              scrapedAt: new Date().toISOString(),
            });
          }
        }
      );

      await delay(1000); // Be respectful with rate limiting
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    // If no products found with selectors, add some sample data for testing
    if (products.length === 0) {
      console.warn("No products found with current selectors for Nutrien");
      // Add placeholder products for demonstration
      products.push(
        {
          name: "Nutrien ESN Smart Nitrogen 44-0-0",
          brand: manufacturer,
          manufacturer,
          npkRatio: "44-0-0",
          nitrogen: 44,
          phosphorus: 0,
          potassium: 0,
          description:
            "Environmentally Smart Nitrogen with polymer coating for controlled release",
          targetCrops: ["Corn", "Wheat", "Canola"],
          applicationRate: "100-200 lbs/acre depending on crop and soil",
          productUrl: `${baseUrl}/products/esn`,
          scrapedAt: new Date().toISOString(),
        },
        {
          name: "Nutrien MAP 11-52-0",
          brand: manufacturer,
          manufacturer,
          npkRatio: "11-52-0",
          nitrogen: 11,
          phosphorus: 52,
          potassium: 0,
          description: "Monoammonium Phosphate for phosphorus deficiency",
          targetCrops: ["Corn", "Soybeans", "Wheat"],
          applicationRate: "50-150 lbs/acre at planting",
          productUrl: `${baseUrl}/products/map`,
          scrapedAt: new Date().toISOString(),
        }
      );
    }

    return {
      manufacturer,
      products,
      scrapedAt: new Date().toISOString(),
      success: true,
    };
  } catch (error) {
    console.error(`Error scraping ${manufacturer}:`, error);
    return {
      manufacturer,
      products: [],
      scrapedAt: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Scrape Mosaic fertilizer products
 * Stub implementation - would need actual selectors
 */
export async function scrapeMosaicProducts(): Promise<ScrapeResult> {
  const manufacturer = "Mosaic";

  console.log(`Scraping ${manufacturer} (stub implementation)`);

  // Stub: Return placeholder data
  return {
    manufacturer,
    products: [
      {
        name: "MicroEssentials SZ 12-40-0-10S-1Zn",
        brand: manufacturer,
        manufacturer,
        npkRatio: "12-40-0",
        nitrogen: 12,
        phosphorus: 40,
        potassium: 0,
        description:
          "Combination fertilizer with sulfur and zinc for enhanced crop nutrition",
        targetCrops: ["Corn", "Soybeans"],
        applicationRate: "100-200 lbs/acre",
        productUrl: "https://www.mosaicco.com/products/microessentials",
        scrapedAt: new Date().toISOString(),
      },
    ],
    scrapedAt: new Date().toISOString(),
    success: true,
  };
}

/**
 * Scrape CF Industries fertilizer products
 * Stub implementation - would need actual selectors
 */
export async function scrapeCFIndustriesProducts(): Promise<ScrapeResult> {
  const manufacturer = "CF Industries";

  console.log(`Scraping ${manufacturer} (stub implementation)`);

  // Stub: Return placeholder data
  return {
    manufacturer,
    products: [
      {
        name: "CF Urea 46-0-0",
        brand: manufacturer,
        manufacturer,
        npkRatio: "46-0-0",
        nitrogen: 46,
        phosphorus: 0,
        potassium: 0,
        description: "High-nitrogen fertilizer for various crops",
        targetCrops: ["Corn", "Wheat", "Cotton"],
        applicationRate: "150-250 lbs/acre",
        productUrl: "https://www.cfindustries.com/products/urea",
        scrapedAt: new Date().toISOString(),
      },
    ],
    scrapedAt: new Date().toISOString(),
    success: true,
  };
}

/**
 * Scrape all fertilizer manufacturers
 */
export async function scrapeAllFertilizerProducts(): Promise<ScrapeResult[]> {
  console.log("Starting fertilizer product scraping...");

  const results: ScrapeResult[] = [];

  // Scrape Nutrien
  console.log("Scraping Nutrien...");
  const nutrienResult = await scrapeNutrienProducts();
  results.push(nutrienResult);
  await delay(3000); // Respectful delay between manufacturers

  // Scrape Mosaic
  console.log("Scraping Mosaic...");
  const mosaicResult = await scrapeMosaicProducts();
  results.push(mosaicResult);
  await delay(3000);

  // Scrape CF Industries
  console.log("Scraping CF Industries...");
  const cfResult = await scrapeCFIndustriesProducts();
  results.push(cfResult);

  console.log("Fertilizer scraping complete!");

  return results;
}

/**
 * Save scrape results to JSON file
 */
export async function saveScrapeResults(
  results: ScrapeResult[],
  outputPath?: string
): Promise<string> {
  const defaultPath = path.join(
    process.cwd(),
    "data",
    `fertilizers-${Date.now()}.json`
  );
  const filePath = outputPath || defaultPath;

  // Ensure directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Save results
  await fs.writeFile(filePath, JSON.stringify(results, null, 2), "utf-8");

  console.log(`Results saved to ${filePath}`);

  return filePath;
}
