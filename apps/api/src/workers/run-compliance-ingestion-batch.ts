import type { EventBridgeHandler } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import {
  getComplianceIngestionQueue,
  type ComplianceIngestionQueue,
} from '../queue/compliance-ingestion-queue';
import type { ComplianceSourceDescriptor } from '@crop-copilot/contracts';

interface ComplianceSourceRow {
  id: string;
  url: string;
  priority: 'high' | 'medium' | 'low';
  freshness_hours: number;
  jurisdiction: string;
  state: string | null;
  crop: string | null;
  tags: unknown;
}

interface ScheduledComplianceEvent {
  trigger?: 'scheduled' | 'manual';
  maxSources?: number;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    pool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 4),
      ssl: resolvePoolSslConfig(),
    });
  }
  return pool;
}

function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === 'string');
}

async function claimDueSources(db: Pool, maxSources: number): Promise<ComplianceSourceRow[]> {
  const result = await db.query<ComplianceSourceRow>(
    `
      UPDATE "ComplianceSource"
      SET
        status = 'running',
        "updatedAt" = NOW(),
        "errorMessage" = NULL
      WHERE id IN (
        SELECT id
        FROM "ComplianceSource"
        WHERE
          status IN ('pending', 'error')
          OR (
            status = 'indexed'
            AND (
              "lastFetchedAt" IS NULL
              OR "lastFetchedAt" < NOW() - make_interval(hours => "freshnessHours")
            )
          )
        ORDER BY
          CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
          "lastFetchedAt" ASC NULLS FIRST
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id,
        url,
        priority,
        "freshnessHours" AS freshness_hours,
        jurisdiction,
        state,
        crop,
        tags
    `,
    [maxSources]
  );

  return result.rows;
}

async function insertRun(db: Pool, trigger: string, sourcesQueued: number): Promise<string> {
  const runId = randomUUID();
  await db.query(
    `
      INSERT INTO "ComplianceIngestionRun" (
        id,
        trigger,
        status,
        "sourcesQueued",
        "startedAt",
        metadata,
        "createdAt"
      )
      VALUES ($1, $2, 'running', $3, NOW(), $4::jsonb, NOW())
    `,
    [runId, trigger, sourcesQueued, JSON.stringify({})]
  );
  return runId;
}

async function markRunCompleted(db: Pool, runId: string): Promise<void> {
  await db.query(
    `
      UPDATE "ComplianceIngestionRun"
      SET status = 'completed', "endedAt" = NOW()
      WHERE id = $1
    `,
    [runId]
  );
}

export function buildRunComplianceIngestionBatchHandler(
  queue: ComplianceIngestionQueue = getComplianceIngestionQueue()
): EventBridgeHandler<'crop-copilot.compliance.ingestion.scheduled', ScheduledComplianceEvent, void> {
  return async (event) => {
    const db = getPool();
    const maxSources = Math.min(Math.max(event.detail?.maxSources ?? 50, 1), 250);
    const trigger = event.detail?.trigger ?? 'scheduled';

    const sources = await claimDueSources(db, maxSources);
    const runId = await insertRun(db, trigger, sources.length);

    if (sources.length === 0) {
      await markRunCompleted(db, runId);
      return;
    }

    const payloadSources: ComplianceSourceDescriptor[] = sources.map((row) => ({
      sourceId: row.id,
      url: row.url,
      priority: row.priority,
      freshnessHours: row.freshness_hours,
      jurisdiction: row.jurisdiction,
      state: row.state,
      crop: row.crop,
      tags: parseTags(row.tags),
    }));

    await queue.publishComplianceIngestionBatch({
      messageType: 'compliance.ingestion.batch.requested',
      messageVersion: '1',
      requestedAt: new Date().toISOString(),
      runId,
      sources: payloadSources,
    });
  };
}

export const handler = buildRunComplianceIngestionBatchHandler();
