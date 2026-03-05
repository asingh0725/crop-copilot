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

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_BATCH_SIZE = 20;
const MAX_CHUNKS_PER_SOURCE = 250;

let pool: Pool | null = null;

interface ComplianceChunkRow {
  id: string;
  content: string;
  position: number;
  tags: string[];
  embedding: number[] | null;
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
): Promise<{ chunks: number; facts: number; success: boolean }> {
  try {
    const document = await scrapeUrl(source.url, { pdfMode: 'pdf_parse_only' });

    const rawChunks = document.sections.flatMap((section, index) =>
      chunkComplianceText(section.heading, section.body, index * 1000)
    );
    const capped = rawChunks.slice(0, MAX_CHUNKS_PER_SOURCE);

    const embeddings = await embedTexts(capped.map((chunk) => chunk.content));

    const chunks: ComplianceChunkRow[] = capped.map((chunk, index) => ({
      id: deterministicChunkId(source.sourceId, chunk.position),
      content: chunk.content,
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
          `,
          [chunk.id, source.sourceId, chunk.content, metadata]
        );
      }
    }

    let factsExtracted = 0;
    for (const chunk of chunks) {
      const facts = extractComplianceFacts(chunk.content);
      for (const fact of facts) {
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
            fact.factValue,
            fact.confidence,
            JSON.stringify(fact.metadata),
          ]
        );
      }
    }

    const contentHash = createHash('sha1').update(document.rawText).digest('hex');

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

    return { chunks: chunks.length, facts: factsExtracted, success: true };
  } catch (error) {
    try {
      await db.query('ROLLBACK');
    } catch {
      // ignored
    }

    await db.query(
      `
        UPDATE "ComplianceSource"
        SET
          status = 'error',
          "errorMessage" = $2,
          "updatedAt" = NOW()
        WHERE id = $1
      `,
      [source.sourceId, (error as Error).message.slice(0, 500)]
    );

    return { chunks: 0, facts: 0, success: false };
  }
}

async function markRun(
  db: Pool,
  runId: string,
  aggregate: { processed: number; chunks: number; facts: number; errors: number }
): Promise<void> {
  await db.query(
    `
      UPDATE "ComplianceIngestionRun"
      SET
        status = $2,
        "sourcesProcessed" = $3,
        "chunksCreated" = $4,
        "factsExtracted" = $5,
        errors = $6,
        "endedAt" = NOW()
      WHERE id = $1
    `,
    [runId, aggregate.errors > 0 ? 'failed' : 'completed', aggregate.processed, aggregate.chunks, aggregate.facts, aggregate.errors]
  );
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  const db = getPool();
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const payload = ComplianceIngestionBatchMessageSchema.parse(JSON.parse(record.body));
      const aggregate = { processed: 0, chunks: 0, facts: 0, errors: 0 };

      for (const source of payload.sources) {
        const result = await processSource(db, source);
        aggregate.processed += 1;
        aggregate.chunks += result.chunks;
        aggregate.facts += result.facts;
        if (!result.success) {
          aggregate.errors += 1;
        }
      }

      if (payload.runId) {
        await markRun(db, payload.runId, aggregate);
      }
    } catch (error) {
      console.error('[ComplianceIngestion] Failed to process record', {
        messageId: record.messageId,
        error: (error as Error).message,
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
