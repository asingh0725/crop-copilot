import { detectContentType } from "../parsers/content-type-detector";
import { BaseScraper } from "./base-scraper";
import type { ScrapedDocument, SourceUrlConfig } from "./types";
import { SourceType } from "@prisma/client";

export class ExtensionScraper extends BaseScraper {
  // Update the scrape method in lib/ingestion/scrapers/extension-scraper.ts
  async scrape(url: string): Promise<ScrapedDocument> {
    try {
      const buffer = await this.fetchPDF(url);
      const actualType = detectContentType(buffer, url);

      if (actualType === "pdf") {
        return this.processPDFBuffer(buffer, url);
      }

      // If we hit an HTML page instead of a PDF (e.g., MSU landing pages)
      if (actualType === "html") {
        const html = buffer.toString("utf8");

        // Look for PDF links in the page content (Landing Page Pattern)
        const pdfMatch = html.match(/href="([^"]+\.pdf)"/i);
        if (pdfMatch) {
          const absolutePdfUrl = new URL(pdfMatch[1], url).href;
          console.log(`Found PDF link on landing page: ${absolutePdfUrl}`);
          const pdfBuffer = await this.fetchPDF(absolutePdfUrl);
          return this.processPDFBuffer(pdfBuffer, absolutePdfUrl);
        }

        return this.processHTMLBuffer(buffer, url);
      }

      // Fallback: attempt to treat unknown content as HTML
      const fallbackHtml = buffer.toString("utf8");
      if (/<html|<!doctype|<head|<!--/i.test(fallbackHtml)) {
        return this.processHTMLBuffer(buffer, url);
      }

      throw new Error("Unknown content type");
    } catch (error) {
      console.error(`Scrape failed for ${url}:`, error);
      throw error;
    }
  }

  /**
   * Process a buffer identified as PDF
   */
  private processPDFBuffer(buffer: Buffer, url: string): ScrapedDocument {
    const filename = url.split("/").pop() || "document.pdf";
    const title = filename.replace(".pdf", "").replace(/[-_]/g, " ");

    return {
      url,
      title,
      content: buffer.toString("base64"),
      contentType: "pdf",
      sourceType: this.detectSourceType(url),
      metadata: {
        institution: this.detectInstitution(url),
        crops: [],
        topics: [],
        region: this.detectRegion(url),
      },
    };
  }

  /**
   * Process a buffer identified as HTML (even if URL suggested PDF)
   */
  private processHTMLBuffer(buffer: Buffer, url: string): ScrapedDocument {
    const html = buffer.toString("utf8");
    const titleMatch = html.match(/<title[^>]*>([^<]+)</i);
    let title = titleMatch ? titleMatch[1].trim() : "Untitled";

    // Detect if this is a "hidden" 404 page
    if (
      title.toLowerCase().includes("not found") ||
      title.toLowerCase().includes("404")
    ) {
      console.warn(`   ⚠️  Detected 404/Error Page for: ${url}`);
    }

    return {
      url,
      title,
      content: html,
      contentType: "html",
      sourceType: this.detectSourceType(url),
      metadata: {
        institution: this.detectInstitution(url),
        crops: [],
        topics: [],
        region: this.detectRegion(url),
      },
    };
  }

  /**
   * Scrape HTML document
   */
  private async scrapeHTML(url: string): Promise<ScrapedDocument> {
    const html = await this.fetchHTML(url, false);

    // Extract title (basic extraction - will be refined in parser)
    const titleMatch = html.match(/<title[^>]*>([^<]+)</i);
    const title = titleMatch ? titleMatch[1].trim() : "Untitled";

    // Detect institution from URL
    const institution = this.detectInstitution(url);
    const sourceType = this.detectSourceType(url);

    return {
      url,
      title,
      content: html,
      contentType: "html",
      sourceType,
      metadata: {
        institution,
        crops: [], // Will be inferred during parsing
        topics: [], // Will be inferred during parsing
        region: this.detectRegion(url),
      },
    };
  }

  /**
   * Scrape PDF document
   */
  private async scrapePDF(url: string): Promise<ScrapedDocument> {
    const buffer = await this.fetchPDF(url);

    // Extract filename as title (will be refined in parser)
    const filename = url.split("/").pop() || "document.pdf";
    const title = filename.replace(".pdf", "").replace(/[-_]/g, " ");

    const institution = this.detectInstitution(url);
    const sourceType = this.detectSourceType(url);

    return {
      url,
      title,
      content: buffer.toString("base64"),
      contentType: "pdf",
      sourceType,
      metadata: {
        institution,
        crops: [],
        topics: [],
        region: this.detectRegion(url),
      },
    };
  }

  /**
   * Scrape from URL list configuration
   */
  async scrapeFromUrlList(
    sourceList: SourceUrlConfig,
    phase: 1 | 2 | 3
  ): Promise<ScrapedDocument[]> {
    console.log(`\n🌱 Starting Phase ${phase} Scraping`);
    console.log(`Description: ${sourceList.description}`);
    console.log(`Sources: ${Object.keys(sourceList.sources).length}\n`);

    const allDocs: ScrapedDocument[] = [];

    for (const [sourceKey, sourceConfig] of Object.entries(
      sourceList.sources
    )) {
      console.log(
        `\n📚 ${sourceConfig.institution} (${sourceConfig.priority} priority)`
      );
      console.log(`   URLs: ${sourceConfig.urls.length}`);

      const docs = await this.scrapeMultiple(
        sourceConfig.urls.map((u) => u.url),
        (current, total) => {
          const percent = Math.round((current / total) * 100);
          console.log(`   Progress: ${current}/${total} (${percent}%)`);
        }
      );

      // Enhance metadata with URL list information
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const urlConfig = sourceConfig.urls[i];

        if (urlConfig) {
          doc.metadata.crops = urlConfig.crops;
          doc.metadata.topics = urlConfig.topics;
          doc.title = urlConfig.title || doc.title;
        }
      }

      allDocs.push(...docs);
    }

    console.log(`\n✅ Phase ${phase} Scraping Complete`);
    console.log(`   Total documents: ${allDocs.length}`);
    console.log(
      `   HTML: ${allDocs.filter((d) => d.contentType === "html").length}`
    );
    console.log(
      `   PDF: ${allDocs.filter((d) => d.contentType === "pdf").length}`
    );

    return allDocs;
  }

  /**
   * Detect institution from URL
   */
  private detectInstitution(url: string): string | undefined {
    const institutionMap: Record<string, string> = {
      "extension.iastate.edu": "Iowa State University Extension",
      "store.extension.iastate.edu": "Iowa State University Extension",
      "extension.purdue.edu": "Purdue Extension",
      "extension.illinois.edu": "University of Illinois Extension",
      "extension.osu.edu": "Ohio State University Extension",
      "extension.unl.edu": "Nebraska Extension",
      "ksre.k-state.edu": "Kansas State Research & Extension",
      "extension.umn.edu": "University of Minnesota Extension",
      "extension.missouri.edu": "University of Missouri Extension",
      "extension.sdstate.edu": "SDSU Extension",
      "ndsu.edu": "NDSU Extension",
      "extension.uga.edu": "UGA Extension",
      "edis.ifas.ufl.edu": "UF/IFAS Extension",
      "aces.edu": "Alabama Extension",
      "extension.msstate.edu": "MSU Extension",
      "lsuagcenter.com": "LSU AgCenter",
      "uaex.uada.edu": "University of Arkansas Extension",
      "extension.tennessee.edu": "UT Extension",
      "content.ces.ncsu.edu": "NC State Extension",
      "clemson.edu": "Clemson Extension",
      "anrcatalog.ucanr.edu": "UC ANR",
      "extension.wsu.edu": "WSU Extension",
      "extension.oregonstate.edu": "OSU Extension",
      "uidaho.edu": "University of Idaho Extension",
      "agrilifeextension.tamu.edu": "Texas A&M AgriLife",
      "extension.colostate.edu": "CSU Extension",
      "extension.arizona.edu": "University of Arizona Extension",
      "cals.cornell.edu": "Cornell Cooperative Extension",
      "extension.psu.edu": "Penn State Extension",
      "canr.msu.edu": "MSU Extension",
      "extension.wisc.edu": "UW-Madison Extension",
      "njaes.rutgers.edu": "Rutgers Cooperative Extension",
      "extension.umd.edu": "University of Maryland Extension",
      "ext.vt.edu": "Virginia Cooperative Extension",
      "ontario.ca": "OMAFRA",
      "gov.mb.ca": "Manitoba Agriculture",
      "saskatchewan.ca": "Saskatchewan Ministry of Agriculture",
      "alberta.ca": "Alberta Agriculture",
      "craaq.qc.ca": "CRAAQ",
      "gov.bc.ca": "BC Ministry of Agriculture",
    };

    for (const [domain, institution] of Object.entries(institutionMap)) {
      if (url.includes(domain)) {
        return institution;
      }
    }

    return undefined;
  }

  /**
   * Detect source type from URL
   */
  private detectSourceType(url: string): SourceType {
    if (
      url.includes("extension") ||
      url.includes("edu") ||
      url.includes("university")
    ) {
      return "UNIVERSITY_EXTENSION";
    }

    if (url.includes("gov") || url.includes("usda") || url.includes("nrcs")) {
      return "GOVERNMENT";
    }

    return "UNIVERSITY_EXTENSION"; // Default
  }

  /**
   * Detect region from URL/institution
   */
  private detectRegion(url: string): string | undefined {
    const regionMap: Record<string, string> = {
      "iastate.edu": "Corn Belt",
      "purdue.edu": "Corn Belt",
      "illinois.edu": "Corn Belt",
      "osu.edu": "Corn Belt",
      "unl.edu": "Great Plains",
      "k-state.edu": "Great Plains",
      "umn.edu": "Corn Belt",
      "missouri.edu": "Corn Belt",
      "sdstate.edu": "Great Plains",
      "ndsu.edu": "Great Plains",
      "uga.edu": "Southeast",
      "ufl.edu": "Southeast",
      "aces.edu": "Southeast",
      "msstate.edu": "Southeast",
      "lsuagcenter.com": "Delta",
      "uada.edu": "Delta",
      "tennessee.edu": "Southeast",
      "ncsu.edu": "Southeast",
      "clemson.edu": "Southeast",
      "ucanr.edu": "California",
      "wsu.edu": "Pacific Northwest",
      "oregonstate.edu": "Pacific Northwest",
      "uidaho.edu": "Pacific Northwest",
      "tamu.edu": "Great Plains",
      "colostate.edu": "Mountain",
      "arizona.edu": "Mountain",
      "cornell.edu": "Northeast",
      "psu.edu": "Mid-Atlantic",
      "msu.edu": "Lake States",
      "wisc.edu": "Lake States",
      "rutgers.edu": "Mid-Atlantic",
      "umd.edu": "Mid-Atlantic",
      "vt.edu": "Mid-Atlantic",
      "ontario.ca": "Ontario",
      "mb.ca": "Canadian Prairies",
      "saskatchewan.ca": "Canadian Prairies",
      "alberta.ca": "Canadian Prairies",
      "qc.ca": "Quebec",
      "bc.ca": "British Columbia",
    };

    for (const [domain, region] of Object.entries(regionMap)) {
      if (url.includes(domain)) {
        return region;
      }
    }

    return undefined;
  }
}
