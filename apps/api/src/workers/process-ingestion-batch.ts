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
import { recordPipelineEvent } from '../lib/pipeline-events';

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
  // Short-circuit to in-memory registry when no DB is configured (e.g. unit tests)
  if (!process.env.DATABASE_URL) return getSourceRegistry();
  const pool = sharedPool ?? getPool();
  return new DbSourceRegistry(pool);
}

function isSkippableFetchFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('http 300') ||
    normalized.includes('http 403') ||
    normalized.includes('http 404') ||
    normalized.includes('http 410') ||
    normalized.includes('http 429') ||
    normalized.includes('http 5') ||
    normalized.includes('http 500') ||
    normalized.includes('http 502') ||
    normalized.includes('http 503') ||
    normalized.includes('http 504') ||
    normalized.includes('internal server error') ||
    normalized.includes('multiple choices') ||
    normalized.includes('site blocks scraping') ||
    normalized.includes('fetch failed') ||
    normalized.includes('timed out') ||
    normalized.includes('aborted') ||
    normalized.includes('enotfound') ||
    normalized.includes('econn')
  );
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
        INSERT INTO "TextChunk" (id, content, embedding, "sourceId", metadata, "createdAt")
        VALUES ($1, $2, $3::vector, $4, $5::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET
          content   = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          metadata  = EXCLUDED.metadata
        `,
        [chunk.id, chunk.content, vectorLiteral, chunk.sourceId, metadata],
      );
    } else {
      // Store without embedding — will be excluded from vector search but visible to lexical
      await pool.query(
        `
        INSERT INTO "TextChunk" (id, content, "sourceId", metadata, "createdAt")
        VALUES ($1, $2, $3, $4::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET
          content  = EXCLUDED.content,
          metadata = EXCLUDED.metadata
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
  errorMessage: string | null = null,
): Promise<void> {
  await pool.query(
    `UPDATE "Source"
     SET status        = $1,
         "chunksCount" = $2,
         "errorMessage" = $4,
         "lastScrapedAt" = NOW(),
         "updatedAt"   = NOW()
     WHERE id = $3`,
    [status, chunksCount, sourceId, errorMessage],
  );
}

async function markSourceSkipped(pool: Pool, sourceId: string, reason: string): Promise<void> {
  await pool.query(
    `UPDATE "Source"
     SET status = 'ready',
         "chunksCount" = 0,
         "errorMessage" = $2,
         "lastScrapedAt" = NOW(),
         "updatedAt" = NOW()
     WHERE id = $1`,
    [sourceId, `[skipped:fetch] ${reason}`.slice(0, 500)]
  );
}

function trimErrorMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function buildTaggedError(stage: 'fetch' | 'process', message: string): string {
  return trimErrorMessage(`[${stage}] ${message}`);
}

// ─── Per-source processing ────────────────────────────────────────────────────

async function processSource(
  pool: Pool,
  source: IngestionSourceDescriptor,
): Promise<{ chunksIngested: number }> {
  console.log(`[Ingestion] Scraping ${source.url}`);

  let doc;
  try {
    doc = await scrapeUrl(source.url, { pdfMode: 'pymupdf_preferred' });
  } catch (error) {
    const message = (error as Error).message;
    if (isSkippableFetchFailure(message)) {
      console.warn(`[Ingestion] Source marked ready with skipped fetch: ${source.url}: ${message}`);
      await markSourceSkipped(pool, source.sourceId, message).catch(() => undefined);
      await recordPipelineEvent(pool, {
        pipeline: 'discovery',
        stage: 'ingestion_fetch_skipped',
        severity: 'warn',
        message,
        sourceId: source.sourceId,
        url: source.url,
      });
      return { chunksIngested: 0 };
    }

    console.error(`[Ingestion] Scrape failed for ${source.url}:`, message);
    await updateSourceStatus(
      pool,
      source.sourceId,
      'error',
      0,
      buildTaggedError('fetch', message),
    ).catch(() => undefined);
    await recordPipelineEvent(pool, {
      pipeline: 'discovery',
      stage: 'ingestion_fetch',
      severity: 'error',
      message,
      sourceId: source.sourceId,
      url: source.url,
    });
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
  const registry = getRegistry();
  const processedAt = new Date(payload.requestedAt);
  const configuredConcurrency = Number(process.env.INGESTION_SOURCE_CONCURRENCY ?? 4);
  const concurrency = Math.max(1, Math.min(Math.floor(configuredConcurrency), 12));

  let cursor = 0;
  const workerCount = Math.min(concurrency, payload.sources.length || 1);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      const source = payload.sources[index];
      if (!source) {
        return;
      }

      try {
        // Resolve the pool inside the per-source try so that a missing DATABASE_URL
        // is treated as a per-source failure (logged + skipped) rather than crashing
        // the entire batch and causing SQS redelivery.
        const pool = getPool();
        await processSource(pool, source);
        await registry.markSourceProcessed(source.sourceId, processedAt);
      } catch (error) {
        const message = (error as Error).message;
        try {
          const pool = getPool();
          await updateSourceStatus(
            pool,
            source.sourceId,
            'error',
            0,
            buildTaggedError('process', message),
          );
        } catch {
          // ignored: status update best-effort
        }
        console.error(`[Ingestion] Source ${source.sourceId} failed:`, message);
        try {
          const pool = getPool();
          await recordPipelineEvent(pool, {
            pipeline: 'discovery',
            stage: 'ingestion_process',
            severity: 'error',
            message,
            sourceId: source.sourceId,
            url: source.url,
          });
        } catch {
          // best effort
        }
        // Don't rethrow — continue with remaining sources in the batch.
        // Source status is already set to 'error' by processSource; skip markSourceProcessed
        // so the scheduler picks it up again on the next cycle.
      }
    }
  });

  await Promise.all(workers);
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
      try {
        const pool = getPool();
        await recordPipelineEvent(pool, {
          pipeline: 'discovery',
          stage: 'ingestion_batch_record',
          severity: 'error',
          message: `Failed to process ingestion batch message: ${(error as Error).message}`,
          metadata: {
            messageId: record.messageId,
          },
        });
      } catch {
        // best effort
      }
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
