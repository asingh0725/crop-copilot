import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { chromium, Browser, Page } from "playwright";
import type { ScraperConfig, ScrapedDocument } from "./types";

export abstract class BaseScraper {
  protected config: ScraperConfig;
  protected browser: Browser | null = null;
  private requestQueue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;

  constructor(config: Partial<ScraperConfig> = {}) {
    this.config = {
      rateLimit: config.rateLimit || 1000,
      maxRetries: config.maxRetries || 3,
      userAgent:
        config.userAgent ||
        "AI-Agronomist-Bot/1.0 (+https://cropcopilot.com/bot)",
      cacheDir: config.cacheDir || "ingestion/.cache",
    };
  }

  /**
   * Initialize browser for JS-rendered pages
   */
  protected async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
      });
    }
  }

  protected getHeaders(url: string) {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      Accept:
        "application/pdf,text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      Referer: new URL(url).origin, // Mimic internal navigation
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    };
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Generate MD5 hash for URL to use as cache filename
   */
  protected getCacheKey(url: string): string {
    return crypto.createHash("md5").update(url).digest("hex");
  }

  /**
   * Get cache file path
   */
  protected getCachePath(url: string, type: "html" | "pdf"): string {
    const key = this.getCacheKey(url);
    const dir = path.join(this.config.cacheDir, "documents");
    return path.join(dir, `${key}.${type === "pdf" ? "pdf" : "html"}`);
  }

  /**
   * Check if response is cached
   */
  protected async isCached(
    url: string,
    type: "html" | "pdf"
  ): Promise<boolean> {
    try {
      const cachePath = this.getCachePath(url, type);
      await fs.access(cachePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read from cache
   */
  protected async readFromCache(
    url: string,
    type: "html" | "pdf"
  ): Promise<string | null> {
    try {
      const cachePath = this.getCachePath(url, type);
      const content = await fs.readFile(cachePath, "utf-8");
      console.log(`  ✓ Loaded from cache: ${url}`);
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Write to cache
   */
  protected async writeToCache(
    url: string,
    content: string,
    type: "html" | "pdf"
  ): Promise<void> {
    try {
      const cachePath = this.getCachePath(url, type);
      const dir = path.dirname(cachePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(cachePath, content, "utf-8");
    } catch (error) {
      console.error(`Failed to write cache for ${url}:`, error);
    }
  }

  /**
   * Enforce rate limiting
   */
  protected async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.config.rateLimit) {
      const waitTime = this.config.rateLimit - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch with retry logic and exponential backoff
   */
  protected async fetchWithRetry<T>(
    fn: () => Promise<T>,
    url: string,
    attempt = 1
  ): Promise<T> {
    try {
      await this.enforceRateLimit();
      return await fn();
    } catch (error) {
      if (attempt >= this.config.maxRetries) {
        console.error(`  ✗ Failed after ${attempt} attempts: ${url}`);
        await this.logError(url, error);
        throw error;
      }

      const waitTime = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      console.log(
        `  ⟲ Retry ${attempt}/${this.config.maxRetries} after ${waitTime}ms: ${url}`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      return this.fetchWithRetry(fn, url, attempt + 1);
    }
  }

  /**
   * Fetch HTML page (static or with Playwright for JS-rendered)
   */
  protected async fetchHTML(
    url: string,
    usePlaywright = false
  ): Promise<string> {
    // Check cache first
    const cached = await this.readFromCache(url, "html");
    if (cached) return cached;

    let html: string;

    if (usePlaywright) {
      await this.initBrowser();
      const page = await this.browser!.newPage({
        userAgent: this.config.userAgent,
      });

      try {
        html = await this.fetchWithRetry(async () => {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          return await page.content();
        }, url);
      } finally {
        await page.close();
      }
    } else {
      html = await this.fetchWithRetry(async () => {
        const response = await fetch(url, {
          headers: {
            "User-Agent": this.config.userAgent,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.text();
      }, url);
    }

    // Cache the response
    await this.writeToCache(url, html, "html");
    return html;
  }

  /**
   * Fetch PDF
   */
  protected async fetchPDF(url: string): Promise<Buffer> {
    // Check cache first
    const cached = await this.readFromCache(url, "pdf");
    if (cached) {
      return Buffer.from(cached, "base64");
    }

    const buffer = await this.fetchWithRetry(async () => {
      const response = await fetch(url, {
        headers: this.getHeaders(url),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }, url);

    // Cache as base64
    await this.writeToCache(url, buffer.toString("base64"), "pdf");
    return buffer;
  }

  /**
   * Check robots.txt compliance
   */
  protected async checkRobotsTxt(url: string): Promise<boolean> {
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

      const robots = await fetch(robotsUrl);
      if (!robots.ok) return true; // No robots.txt, assume allowed

      const robotsTxt = await robots.text();

      // Simple check for User-agent: * disallow
      // More sophisticated parsing could be added
      const lines = robotsTxt.split("\n");
      let applies = false;

      for (const line of lines) {
        if (line.trim().toLowerCase().startsWith("user-agent:")) {
          applies = line.includes("*");
        }
        if (applies && line.trim().toLowerCase().startsWith("disallow:")) {
          const path = line.split(":")[1].trim();
          if (path && urlObj.pathname.startsWith(path)) {
            return false; // Disallowed
          }
        }
      }

      return true; // Allowed
    } catch {
      return true; // Error checking robots.txt, assume allowed
    }
  }

  /**
   * Log error to file
   */
  protected async logError(url: string, error: unknown): Promise<void> {
    try {
      const logDir = "ingestion/logs";
      await fs.mkdir(logDir, { recursive: true });

      const logPath = path.join(logDir, "scraper-errors.log");
      const timestamp = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      const logEntry = `[${timestamp}] URL: ${url}\nError: ${message}\n${error instanceof Error ? error.stack : ""}\n\n`;

      await fs.appendFile(logPath, logEntry);
    } catch (logError) {
      console.error("Failed to write error log:", logError);
    }
  }

  /**
   * Abstract method to be implemented by subclasses
   */
  abstract scrape(url: string): Promise<ScrapedDocument>;

  /**
   * Scrape multiple URLs with progress tracking
   */
  async scrapeMultiple(
    urls: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<ScrapedDocument[]> {
    const results: ScrapedDocument[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\n[${i + 1}/${urls.length}] Scraping: ${url}`);

      try {
        const doc = await this.scrape(url);
        results.push(doc);
        console.log(`  ✓ Success: ${doc.title}`);
      } catch (error) {
        console.error(`  ✗ Failed: ${url}`);
        console.error(
          `  Error: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      if (onProgress) {
        onProgress(i + 1, urls.length);
      }
    }

    return results;
  }
}
