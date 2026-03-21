import { createHash, randomUUID } from 'node:crypto';
import type { SQSBatchItemFailure, SQSEvent, SQSHandler } from 'aws-lambda';
import { Pool } from 'pg';
import {
  ComplianceIngestionBatchMessageSchema,
  type ComplianceSourceDescriptor,
} from '@crop-copilot/contracts';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { scrapeUrl } from '../ingestion/scraper';
import { chunkComplianceText } from '../rag/compliance-semantic-chunker';
import { extractComplianceFacts } from '../compliance/fact-extractor';
import { recordPipelineEvent } from '../lib/pipeline-events';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_BATCH_SIZE = 20;
const MAX_CHUNKS_PER_SOURCE = 250;
const MIN_PARSEABLE_TEXT_CHARS = 120;

let pool: Pool | null = null;

interface ComplianceChunkRow {
  id: string;
  content: string;
  position: number;
  tags: string[];
  embedding: number[] | null;
}

type IngestionFailureStage = 'fetch' | 'parse' | 'chunk' | 'database' | 'unknown';

interface ProcessSourceResult {
  chunks: number;
  facts: number;
  success: boolean;
  errorStage: IngestionFailureStage | null;
  errorMessage: string | null;
}

interface FailedSourceSummary {
  sourceId: string;
  url: string;
  stage: IngestionFailureStage;
  message: string;
}

class IngestionStageError extends Error {
  constructor(
    readonly stage: IngestionFailureStage,
    message: string
  ) {
    super(message);
    this.name = 'IngestionStageError';
  }
}

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for compliance ingestion worker');
    pool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 5),
      ssl: resolvePoolSslConfig(),
    });
  }
  return pool;
}

function deterministicChunkId(sourceId: string, position: number): string {
  const digest = createHash('sha1').update(`${sourceId}:${position}`).digest('hex');
  return digest.slice(0, 32);
}

async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return texts.map(() => null);
  }

  const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || EMBEDDING_MODEL;
  const out: (number[] | null)[] = [];

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
        const message = await response.text().catch(() => '');
        throw new Error(`OpenAI embeddings ${response.status}: ${message.slice(0, 120)}`);
      }

      const payload = (await response.json()) as {
        data?: Array<{ index: number; embedding?: number[] }>;
      };
      const sorted = (payload.data ?? []).sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        out.push(Array.isArray(item.embedding) ? item.embedding : null);
      }
    } catch (error) {
      console.warn('[ComplianceIngestion] Embedding batch failed', {
        error: (error as Error).message,
      });
      for (let j = 0; j < batch.length; j += 1) {
        out.push(null);
      }
    }
  }

  return out;
}

function trimErrorMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function sanitizeDbText(text: string): string {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[\ud800-\udfff]/g, '')
    .trim();
}

function classifyUnknownStage(message: string): IngestionFailureStage {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('http ') ||
    normalized.includes('fetch') ||
    normalized.includes('timeout') ||
    normalized.includes('aborted') ||
    normalized.includes('enotfound') ||
    normalized.includes('econn')
  ) {
    return 'fetch';
  }
  if (
    normalized.includes('pdf') ||
    normalized.includes('parser') ||
    normalized.includes('llamaparse') ||
    normalized.includes('pymupdf') ||
    (normalized.includes('spawn') && normalized.includes('python')) ||
    normalized.includes('enoent') ||
    normalized.includes('parse') ||
    normalized.includes('abortexception') ||
    normalized.includes('formaterror') ||
    normalized.includes('invalidpdfexception')
  ) {
    return 'parse';
  }
  if (normalized.includes('chunk')) {
    return 'chunk';
  }
  if (
    normalized.includes('insert') ||
    normalized.includes('update') ||
    normalized.includes('delete') ||
    normalized.includes('sql') ||
    normalized.includes('database') ||
    normalized.includes('relation')
  ) {
    return 'database';
  }
  return 'unknown';
}

function normalizeError(error: unknown): { stage: IngestionFailureStage; message: string } {
  if (error instanceof IngestionStageError) {
    return {
      stage: error.stage,
      message: trimErrorMessage(error.message),
    };
  }

  const message = trimErrorMessage(error instanceof Error ? error.message : String(error));
  return {
    stage: classifyUnknownStage(message),
    message,
  };
}

function shouldMarkAsSkippedSuccess(normalized: {
  stage: IngestionFailureStage;
  message: string;
}): boolean {
  const message = normalized.message.toLowerCase();
  if (normalized.stage === 'parse') {
    return (
      message.includes('insufficient text content') ||
      message.includes('timed out') ||
      message.includes('spawn python') ||
      message.includes('python3 enoent') ||
      message.includes('python enoent') ||
      message.includes('exited with code 127') ||
      message.includes('python interpreter') ||
      message.includes('no such file') ||
      message.includes('unsupported export shape') ||
      message.includes('invalid pdf') ||
      message.includes('formaterror') ||
      message.includes('abortexception')
    );
  }

  if (normalized.stage === 'fetch') {
    return (
      message.includes('fetch failed') ||
      message.includes('http 403') ||
      message.includes('http 404') ||
      message.includes('http 410') ||
      message.includes('http 429') ||
      message.includes('http 5') ||
      message.includes('http 500') ||
      message.includes('http 502') ||
      message.includes('http 503') ||
      message.includes('http 504') ||
      message.includes('internal server error') ||
      message.includes('site blocks scraping') ||
      message.includes('timed out') ||
      message.includes('aborted') ||
      message.includes('enotfound') ||
      message.includes('econn')
    );
  }

  return false;
}

async function upsertCoverage(
  db: Pool,
  source: ComplianceSourceDescriptor
): Promise<void> {
  const aggregate = await db.query<{ source_count: string; fact_count: string; avg_freshness_hours: string | null }>(
    `
      SELECT
        COUNT(*)::text AS source_count,
        COALESCE(SUM("factsCount"), 0)::text AS fact_count,
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - "lastFetchedAt")) / 3600), 9999)::text AS avg_freshness_hours
      FROM "ComplianceSource"
      WHERE jurisdiction = $1
        AND state IS NOT DISTINCT FROM $2
        AND crop IS NOT DISTINCT FROM $3
        AND status = 'indexed'
    `,
    [source.jurisdiction, source.state ?? null, source.crop ?? null]
  );

  const sourceCount = Number(aggregate.rows[0]?.source_count ?? 0);
  const factCount = Number(aggregate.rows[0]?.fact_count ?? 0);
  const freshnessHours = Number(aggregate.rows[0]?.avg_freshness_hours ?? 9999);

  const sourceScore = Math.min(1, sourceCount / 3);
  const factScore = Math.min(1, factCount / 50);
  const freshnessPenalty = freshnessHours > 72 ? 0.2 : freshnessHours > 36 ? 0.1 : 0;
  const coverageScore = Math.max(0, Math.min(1, sourceScore * 0.6 + factScore * 0.4 - freshnessPenalty));

  await db.query(
    `
      INSERT INTO "ComplianceCoverage" (
        id,
        jurisdiction,
        state,
        crop,
        "sourceCount",
        "factCount",
        "coverageScore",
        "freshnessHours",
        "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (jurisdiction, state, crop) DO UPDATE
        SET
          "sourceCount" = EXCLUDED."sourceCount",
          "factCount" = EXCLUDED."factCount",
          "coverageScore" = EXCLUDED."coverageScore",
          "freshnessHours" = EXCLUDED."freshnessHours",
          "updatedAt" = NOW()
    `,
    [
      randomUUID(),
      source.jurisdiction,
      source.state ?? null,
      source.crop ?? null,
      sourceCount,
      factCount,
      coverageScore,
      Number.isFinite(freshnessHours) ? Math.round(freshnessHours) : null,
    ]
  );
}

async function processSource(
  db: Pool,
  source: ComplianceSourceDescriptor
): Promise<ProcessSourceResult> {
  try {
    const document = await scrapeUrl(source.url, { pdfMode: 'pymupdf_preferred' });

    const rawText = sanitizeDbText(document.rawText);
    if (!rawText || rawText.length < MIN_PARSEABLE_TEXT_CHARS || document.sections.length === 0) {
      throw new IngestionStageError(
        'parse',
        'Parser returned insufficient text content (empty/blocked/scanned PDF).'
      );
    }

    const rawChunks = document.sections
      .flatMap((section, index) =>
        chunkComplianceText(
          sanitizeDbText(section.heading),
          sanitizeDbText(section.body),
          index * 1000
        )
      )
      .filter((chunk) => chunk.content.trim().length > 0);
    const capped = rawChunks.slice(0, MAX_CHUNKS_PER_SOURCE);
    if (capped.length === 0) {
      throw new IngestionStageError(
        'chunk',
        'No semantic chunks were generated from parsed text.'
      );
    }

    const embeddings = await embedTexts(capped.map((chunk) => chunk.content));

    const chunks: ComplianceChunkRow[] = capped.map((chunk, index) => ({
      id: deterministicChunkId(source.sourceId, chunk.position),
      content: sanitizeDbText(chunk.content),
      position: chunk.position,
      tags: chunk.tags,
      embedding: embeddings[index] ?? null,
    }));

    await db.query('BEGIN');

    await db.query(
      `DELETE FROM "ComplianceFact" WHERE "complianceSourceId" = $1`,
      [source.sourceId]
    );
    await db.query(
      `DELETE FROM "ComplianceChunk" WHERE "complianceSourceId" = $1`,
      [source.sourceId]
    );

    for (const chunk of chunks) {
      const metadata = JSON.stringify({
        position: chunk.position,
        tags: chunk.tags,
      });

      if (chunk.embedding) {
        const vectorLiteral = `[${chunk.embedding.join(',')}]`;
        await db.query(
          `
            INSERT INTO "ComplianceChunk" (
              id,
              "complianceSourceId",
              content,
              embedding,
              metadata,
              "createdAt"
            )
            VALUES ($1, $2, $3, $4::vector, $5::jsonb, NOW())
            ON CONFLICT (id) DO UPDATE
              SET
                "complianceSourceId" = EXCLUDED."complianceSourceId",
                content = EXCLUDED.content,
                embedding = EXCLUDED.embedding,
                metadata = EXCLUDED.metadata
          `,
          [chunk.id, source.sourceId, chunk.content, vectorLiteral, metadata]
        );
      } else {
        await db.query(
          `
            INSERT INTO "ComplianceChunk" (
              id,
              "complianceSourceId",
              content,
              metadata,
              "createdAt"
            )
            VALUES ($1, $2, $3, $4::jsonb, NOW())
            ON CONFLICT (id) DO UPDATE
              SET
                "complianceSourceId" = EXCLUDED."complianceSourceId",
                content = EXCLUDED.content,
                embedding = NULL,
                metadata = EXCLUDED.metadata
          `,
          [chunk.id, source.sourceId, chunk.content, metadata]
        );
      }
    }

    let factsExtracted = 0;
    for (const chunk of chunks) {
      const facts = extractComplianceFacts(chunk.content);
      for (const fact of facts) {
        const factValue = sanitizeDbText(fact.factValue);
        if (!factValue) {
          continue;
        }
        factsExtracted += 1;
        await db.query(
          `
            INSERT INTO "ComplianceFact" (
              id,
              "complianceSourceId",
              "chunkId",
              "factType",
              "factKey",
              "factValue",
              confidence,
              metadata,
              "createdAt"
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
          `,
          [
            randomUUID(),
            source.sourceId,
            chunk.id,
            fact.factType,
            fact.factKey,
            factValue,
            fact.confidence,
            JSON.stringify(fact.metadata),
          ]
        );
      }
    }

    const contentHash = createHash('sha1').update(rawText).digest('hex');

    await db.query(
      `
        UPDATE "ComplianceSource"
        SET
          status = 'indexed',
          "chunksCount" = $2,
          "factsCount" = $3,
          "lastFetchedAt" = NOW(),
          "lastIndexedAt" = NOW(),
          "contentHash" = $4,
          "errorMessage" = NULL,
          "updatedAt" = NOW()
        WHERE id = $1
      `,
      [source.sourceId, chunks.length, factsExtracted, contentHash]
    );

    await db.query('COMMIT');
    await upsertCoverage(db, source);

    return {
      chunks: chunks.length,
      facts: factsExtracted,
      success: true,
      errorStage: null,
      errorMessage: null,
    };
  } catch (error) {
    try {
      await db.query('ROLLBACK');
    } catch {
      // ignored
    }

    const normalized = normalizeError(error);
    if (shouldMarkAsSkippedSuccess(normalized)) {
      const skippedMessage = trimErrorMessage(`[skipped:${normalized.stage}] ${normalized.message}`);
      await db.query(
        `
          UPDATE "ComplianceSource"
          SET
            status = 'indexed',
            "chunksCount" = 0,
            "factsCount" = 0,
            "lastFetchedAt" = NOW(),
            "lastIndexedAt" = NOW(),
            "errorMessage" = $2,
            "updatedAt" = NOW()
          WHERE id = $1
        `,
        [source.sourceId, skippedMessage]
      );

      await upsertCoverage(db, source);
      console.warn('[ComplianceIngestion] Source marked indexed with no parseable content', {
        sourceId: source.sourceId,
        url: source.url,
        stage: normalized.stage,
        message: normalized.message,
      });

      return {
        chunks: 0,
        facts: 0,
        success: true,
        errorStage: null,
        errorMessage: null,
      };
    }

    const taggedErrorMessage = trimErrorMessage(`[${normalized.stage}] ${normalized.message}`);

    await db.query(
      `
        UPDATE "ComplianceSource"
        SET
          status = 'error',
          "errorMessage" = $2,
          "updatedAt" = NOW()
        WHERE id = $1
      `,
      [source.sourceId, taggedErrorMessage]
    );

    console.error('[ComplianceIngestion] Source processing failed', {
      sourceId: source.sourceId,
      url: source.url,
      stage: normalized.stage,
      message: normalized.message,
    });
    await recordPipelineEvent(db, {
      pipeline: 'compliance',
      stage: `ingestion_${normalized.stage}`,
      severity: 'error',
      message: normalized.message,
      sourceId: source.sourceId,
      url: source.url,
      metadata: {
        stage: normalized.stage,
      },
    });

    return {
      chunks: 0,
      facts: 0,
      success: false,
      errorStage: normalized.stage,
      errorMessage: taggedErrorMessage,
    };
  }
}

async function markRun(
  db: Pool,
  runId: string,
  aggregate: {
    processed: number;
    chunks: number;
    facts: number;
    errors: number;
    failures: FailedSourceSummary[];
  }
): Promise<void> {
  const status = aggregate.errors > 0 ? 'failed' : 'completed';
  await db.query(
    `
      UPDATE "ComplianceIngestionRun"
      SET
        status = $2,
        "sourcesProcessed" = $3,
        "chunksCreated" = $4,
        "factsExtracted" = $5,
        errors = $6,
        metadata = jsonb_build_object('failedSources', $7::jsonb),
        "endedAt" = NOW()
      WHERE id = $1
    `,
    [
      runId,
      status,
      aggregate.processed,
      aggregate.chunks,
      aggregate.facts,
      aggregate.errors,
      JSON.stringify(aggregate.failures.slice(0, 25)),
    ]
  );

  await recordPipelineEvent(db, {
    pipeline: 'compliance',
    stage: 'ingestion_run',
    severity: aggregate.errors > 0 ? 'warn' : 'info',
    message: `Compliance ingestion run ${status}: ${aggregate.processed} processed, ${aggregate.errors} errors.`,
    runId,
    metadata: {
      status,
      processed: aggregate.processed,
      chunks: aggregate.chunks,
      facts: aggregate.facts,
      errors: aggregate.errors,
      failuresSample: aggregate.failures.slice(0, 10),
    },
  });
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  const db = getPool();
  const batchItemFailures: SQSBatchItemFailure[] = [];
  const configuredConcurrency = Number(process.env.COMPLIANCE_INGESTION_SOURCE_CONCURRENCY ?? 4);
  const sourceConcurrency = Math.max(1, Math.min(Math.floor(configuredConcurrency), 12));

  for (const record of event.Records) {
    try {
      const payload = ComplianceIngestionBatchMessageSchema.parse(JSON.parse(record.body));
      const aggregate = {
        processed: 0,
        chunks: 0,
        facts: 0,
        errors: 0,
        failures: [] as FailedSourceSummary[],
      };

      let cursor = 0;
      const workerCount = Math.min(sourceConcurrency, payload.sources.length || 1);
      const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
          const index = cursor;
          cursor += 1;
          const source = payload.sources[index];
          if (!source) {
            return;
          }

          const result = await processSource(db, source);
          aggregate.processed += 1;
          aggregate.chunks += result.chunks;
          aggregate.facts += result.facts;
          if (!result.success) {
            aggregate.errors += 1;
            aggregate.failures.push({
              sourceId: source.sourceId,
              url: source.url,
              stage: result.errorStage ?? 'unknown',
              message: result.errorMessage ?? 'Unknown ingestion error',
            });
          }
        }
      });
      await Promise.all(workers);

      if (payload.runId) {
        await markRun(db, payload.runId, aggregate);
      }
    } catch (error) {
      console.error('[ComplianceIngestion] Failed to process record', {
        messageId: record.messageId,
        error: (error as Error).message,
      });
      await recordPipelineEvent(db, {
        pipeline: 'compliance',
        stage: 'ingestion_batch_record',
        severity: 'error',
        message: `Failed to process compliance ingestion record: ${(error as Error).message}`,
        metadata: {
          messageId: record.messageId,
        },
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
