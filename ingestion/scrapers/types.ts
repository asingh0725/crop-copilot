import { SourceType } from "@prisma/client";

export interface ScraperConfig {
  rateLimit: number; // ms between requests (min 1000)
  maxRetries: number; // default 3
  userAgent: string; // 'AI-Agronomist-Bot/1.0 (+https://cropcopilot.com/bot)'
  cacheDir: string; // 'ingestion/.cache/'
}

export interface ScrapedDocument {
  url: string;
  title: string;
  content: string; // Raw HTML or PDF buffer as base64
  contentType: "html" | "pdf";
  sourceType: SourceType;
  metadata: {
    institution?: string;
    publishDate?: Date;
    crops?: string[];
    topics?: string[];
    region?: string;
  };
}

export interface ParsedContent {
  title: string;
  sections: Array<{
    heading?: string;
    text: string;
    images: Array<{
      url: string;
      alt?: string;
      caption?: string;
      contextText: string; // 3 paragraphs around image
    }>;
  }>;
  tables: Array<{
    heading?: string;
    rows: string[][];
    caption?: string;
  }>;
  metadata: {
    wordCount: number;
    imageCount: number;
    tableCount: number;
  };
}

export interface ChunkData {
  content: string;
  sourceId: string;
  chunkIndex: number;
  tokenCount: number;
  metadata: {
    section?: string;
    pageNumber?: number;
    heading?: string;
    contentType:
      | "symptom"
      | "treatment"
      | "background"
      | "procedure"
      | "product"
      | "table";
    crops?: string[];
    topics?: string[];
    region?: string;
  };
}

// NEW: ImageData for embedding generation
export interface ImageData {
  id: string;
  sourceId: string;
  imageUrl: string;
  altText: string | null;
  caption: string | null;
  contextText: string | null;
  contextChunkId: string | null;
  metadata: {
    category?: string;
    tags?: string[];
    crop?: string;
    subject?: string;
    pageNumber?: number;
    position: number;
  };
}

export interface ProcessedImage {
  r2Url: string; // 'https://pub-xxx.r2.dev/images/corn_deficiency_nitrogen_001.jpg'
  originalUrl: string;
  caption: string; // From Claude Vision
  embedding: number[]; // 1536 dims
  metadata: {
    sourceId: string;
    crop?: string;
    category?:
      | "deficiency"
      | "disease"
      | "pest"
      | "healthy"
      | "abiotic";
    subject?: string; // e.g., 'nitrogen_deficiency'
    contextText: string; // Surrounding paragraphs
    dimensions: { width: number; height: number };
    fileSize: number;
  };
}

export interface ProgressTracker {
  documentsScraped: number;
  documentsParsed: number;
  chunksCreated: number;
  chunksEmbedded: number;
  imagesProcessed: number;
  imagesEmbedded: number;
  costs: { text: number; images: number; total: number };
}

export interface CostTracker {
  textTokens: number;
  textCost: number; // $0.02 per 1M tokens
  imageDescriptions: number;
  imageCost: number; // $3 per 1M input tokens for Claude
  totalCost: number;
}

export interface SourceUrlConfig {
  phase: 1 | 2 | 3;
  description: string;
  totalUrls?: number;
  estimatedChunks?: number;
  sources: Record<
    string,
    {
      institution: string;
      baseUrl: string;
      priority: "critical" | "high" | "medium";
      urls: Array<{
        url: string;
        title: string;
        crops: string[];
        topics: string[];
        expectedChunks: number;
      }>;
    }
  >;
}

// Image extraction stats
export interface ImageExtractionStats {
  totalImages: number;
  byCategory: Record<string, number>;
  byCrop: Record<string, number>;
  avgAltTextLength: number;
  imagesWithContext: number;
  imagesWithCaptions: number;
}
