/**
 * SQS worker: process-ingestion-batch
 *
 * For each source in the batch:
 *   1. Scrape HTML from the source URL
 *   2. Chunk the text using semantic-chunker-v2
 *   3. Embed each chunk with OpenAI text-embedding-3-small
 *   4. Upsert TextChunk rows (with pgvector embedding)
 *   5. Update Source.status, chunksCount, lastScrapedAt
 *   6. Mark the source processed in the registry
 */

import { randomUUID } from 'node:crypto';
import type { SQSBatchItemFailure, SQSEvent, SQSHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { IngestionBatchMessageSchema } from '@crop-copilot/contracts';
import type { IngestionSourceDescriptor } from '@crop-copilot/contracts';
import { getSourceRegistry } from '../ingestion/source-registry';
import { DbSourceRegistry } from '../ingestion/db-source-registry';
import { scrapeUrl } from '../ingestion/scraper';
import { chunkTextSemantically } from '../rag/semantic-chunker-v2';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_BATCH_SIZE = 20; // OpenAI allows up to 2048 inputs, but keep batches small
const MAX_CHUNKS_PER_SOURCE = 200;

let sharedPool: Pool | null = null;

function getPool(): Pool {
  if (!sharedPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for ingestion worker');
    sharedPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 5),
      ssl: resolvePoolSslConfig(),
    });
  }
  return sharedPool;
}

function getRegistry() {
  const pool = sharedPool ?? getPool();
  return process.env.DATABASE_URL ? new DbSourceRegistry(pool) : getSourceRegistry();
}

// ─── Embedding ───────────────────────────────────────────────────────────────

async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[Ingestion] OPENAI_API_KEY not set — skipping embedding');
    return texts.map(() => null);
  }

  const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || EMBEDDING_MODEL;
  const results: (number[] | null)[] = [];

  // Batch requests to avoid payload size limits
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, input: batch }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI embeddings error ${response.status}: ${err.slice(0, 200)}`);
      }

      const payload = (await response.json()) as {
        data?: Array<{ index: number; embedding?: number[] }>;
      };

      // OpenAI returns items in index order, but sort defensively
      const sorted = (payload.data ?? []).sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        results.push(Array.isArray(item.embedding) ? item.embedding : null);
      }
    } catch (error) {
      console.error('[Ingestion] Embedding batch failed:', (error as Error).message);
      // Push nulls for the whole batch — chunks still upserted without embedding
      for (let j = 0; j < batch.length; j++) results.push(null);
    }
  }

  return results;
}

// ─── DB upsert ───────────────────────────────────────────────────────────────

interface ChunkToUpsert {
  id: string;
  sourceId: string;
  content: string;
  section: string;
  position: number;
  embedding: number[] | null;
  tags: string[];
}

async function upsertChunks(pool: Pool, chunks: ChunkToUpsert[]): Promise<void> {
  for (const chunk of chunks) {
    const metadata = JSON.stringify({
      section: chunk.section,
      position: chunk.position,
      tags: chunk.tags,
    });

    if (chunk.embedding) {
      const vectorLiteral = `[${chunk.embedding.join(',')}]`;
      await pool.query(
        `
        INSERT INTO "TextChunk" (id, content, embedding, "sourceId", metadata, "createdAt", "updatedAt")
        VALUES ($1, $2, $3::vector, $4, $5::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          content    = EXCLUDED.content,
          embedding  = EXCLUDED.embedding,
          metadata   = EXCLUDED.metadata,
          "updatedAt" = NOW()
        `,
        [chunk.id, chunk.content, vectorLiteral, chunk.sourceId, metadata],
      );
    } else {
      // Store without embedding — will be excluded from vector search but visible to lexical
      await pool.query(
        `
        INSERT INTO "TextChunk" (id, content, "sourceId", metadata, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          content    = EXCLUDED.content,
          metadata   = EXCLUDED.metadata,
          "updatedAt" = NOW()
        `,
        [chunk.id, chunk.content, chunk.sourceId, metadata],
      );
    }
  }
}

async function updateSourceStatus(
  pool: Pool,
  sourceId: string,
  status: string,
  chunksCount: number,
): Promise<void> {
  await pool.query(
    `UPDATE "Source"
     SET status        = $1,
         "chunksCount" = $2,
         "lastScrapedAt" = NOW(),
         "updatedAt"   = NOW()
     WHERE id = $3`,
    [status, chunksCount, sourceId],
  );
}

// ─── Per-source processing ────────────────────────────────────────────────────

async function processSource(
  pool: Pool,
  source: IngestionSourceDescriptor,
): Promise<{ chunksIngested: number }> {
  console.log(`[Ingestion] Scraping ${source.url}`);

  let doc;
  try {
    doc = await scrapeUrl(source.url);
  } catch (error) {
    console.error(`[Ingestion] Scrape failed for ${source.url}:`, (error as Error).message);
    await updateSourceStatus(pool, source.sourceId, 'error', 0).catch(() => undefined);
    throw error;
  }

  // Chunk all sections
  const rawChunks: Array<{ section: string; content: string; position: number }> = [];
  let position = 0;

  for (const section of doc.sections) {
    const sectionChunks = chunkTextSemantically(section.heading, section.body);
    for (const c of sectionChunks) {
      rawChunks.push({ section: section.heading, content: c.content, position: position++ });
      if (rawChunks.length >= MAX_CHUNKS_PER_SOURCE) break;
    }
    if (rawChunks.length >= MAX_CHUNKS_PER_SOURCE) break;
  }

  if (rawChunks.length === 0) {
    console.warn(`[Ingestion] No chunks extracted from ${source.url}`);
    await updateSourceStatus(pool, source.sourceId, 'ready', 0);
    return { chunksIngested: 0 };
  }

  // Embed all chunks
  const texts = rawChunks.map((c) => c.content);
  const embeddings = await embedTexts(texts);

  // Build upsert objects — use deterministic IDs so re-runs are idempotent
  const chunks: ChunkToUpsert[] = rawChunks.map((c, i) => ({
    // Deterministic ID: hash of sourceId + position avoids duplicate rows on retry
    id: deterministicId(source.sourceId, c.position),
    sourceId: source.sourceId,
    content: c.content,
    section: c.section,
    position: c.position,
    embedding: embeddings[i] ?? null,
    tags: source.tags,
  }));

  await upsertChunks(pool, chunks);

  const embeddedCount = chunks.filter((c) => c.embedding !== null).length;
  console.log(
    `[Ingestion] ${source.url}: ${chunks.length} chunks upserted, ${embeddedCount} embedded`,
  );

  await updateSourceStatus(pool, source.sourceId, 'ready', chunks.length);
  return { chunksIngested: chunks.length };
}

function deterministicId(sourceId: string, position: number): string {
  // Simple but collision-resistant: namespace + position encoded as UUID v5-style string.
  // We use a fixed prefix + base64 of "sourceId:position" truncated to UUID format.
  const raw = `${sourceId}:${position}`;
  // Build a pseudo-UUID from the string (not cryptographically derived, just stable)
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  const h = Math.abs(hash).toString(16).padStart(8, '0');
  const pos = position.toString(16).padStart(4, '0');
  const sid = sourceId.replace(/-/g, '').slice(0, 16).padEnd(16, '0');
  return `${h}-${pos}-4${sid.slice(0, 3)}-8${sid.slice(3, 6)}-${sid.slice(6, 18)}`;
}

// ─── SQS handler ─────────────────────────────────────────────────────────────

async function processBatch(body: string): Promise<void> {
  const payload = IngestionBatchMessageSchema.parse(JSON.parse(body));
  const pool = getPool();
  const registry = getRegistry();
  const processedAt = new Date(payload.requestedAt);

  for (const source of payload.sources) {
    try {
      await processSource(pool, source);
      await registry.markSourceProcessed(source.sourceId, processedAt);
    } catch (error) {
      console.error(`[Ingestion] Source ${source.sourceId} failed:`, (error as Error).message);
      // Don't rethrow — continue with remaining sources in the batch.
      // Source status is already set to 'error' by processSource; skip markSourceProcessed
      // so the scheduler picks it up again on the next cycle.
    }
  }
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      await processBatch(record.body);
    } catch (error) {
      console.error('[Ingestion] Failed to process batch message', {
        messageId: record.messageId,
        error: (error as Error).message,
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
