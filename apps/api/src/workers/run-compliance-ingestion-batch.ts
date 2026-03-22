import type { EventBridgeHandler } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import {
  getComplianceIngestionQueue,
  type ComplianceIngestionQueue,
} from '../queue/compliance-ingestion-queue';
import type { ComplianceSourceDescriptor } from '@crop-copilot/contracts';
import { recordPipelineEvent } from '../lib/pipeline-events';

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
const DEFAULT_STUCK_RUNNING_MINUTES = 20;

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

async function resetStuckRunningSources(db: Pool): Promise<number> {
  const staleMinutesRaw = Number(
    process.env.COMPLIANCE_RUNNING_STALE_MINUTES ?? DEFAULT_STUCK_RUNNING_MINUTES
  );
  const staleMinutes = Number.isFinite(staleMinutesRaw)
    ? Math.max(2, Math.min(Math.floor(staleMinutesRaw), 240))
    : DEFAULT_STUCK_RUNNING_MINUTES;

  const result = await db.query(
    `
      UPDATE "ComplianceSource"
      SET
        status = 'pending',
        "updatedAt" = NOW()
      WHERE
        status = 'running'
        AND "updatedAt" < NOW() - make_interval(mins => $1)
    `,
    [staleMinutes]
  );
  return result.rowCount ?? 0;
}

async function claimDueSources(db: Pool, maxSources: number): Promise<ComplianceSourceRow[]> {
  const configuredRetryHours = Number(process.env.COMPLIANCE_ERROR_RETRY_HOURS ?? 24);
  const errorRetryHours = Number.isFinite(configuredRetryHours)
    ? Math.max(1, Math.min(Math.floor(configuredRetryHours), 720))
    : 24;
  const configured404RetryHours = Number(process.env.COMPLIANCE_404_RETRY_HOURS ?? 168);
  const error404RetryHours = Number.isFinite(configured404RetryHours)
    ? Math.max(6, Math.min(Math.floor(configured404RetryHours), 24 * 60))
    : 168;

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
          url NOT ILIKE 'https://vertexaisearch.cloud.google.com/%'
          AND url NOT ILIKE 'https://www.google.com/search%'
          AND url NOT ILIKE 'https://google.com/search%'
          AND url NOT ILIKE 'https://www.google.com/url%'
          AND url NOT ILIKE 'https://google.com/url%'
          AND (
            status = 'pending'
          OR (
            status = 'error'
            AND (
              (
                COALESCE("errorMessage", '') ILIKE '%http 404%'
                AND "updatedAt" < NOW() - make_interval(hours => $3)
              )
              OR (
                COALESCE("errorMessage", '') NOT ILIKE '%http 404%'
                AND "updatedAt" < NOW() - make_interval(hours => $2)
              )
            )
          )
          OR (
            status = 'indexed'
            AND (
              "lastFetchedAt" IS NULL
              OR "lastFetchedAt" < NOW() - make_interval(hours => "freshnessHours")
            )
          ))
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
    [maxSources, errorRetryHours, error404RetryHours]
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

    const resetCount = await resetStuckRunningSources(db);
    if (resetCount > 0) {
      console.warn(
        `[RunComplianceIngestionBatch] Reset ${resetCount} stale running sources to pending`
      );
      await recordPipelineEvent(db, {
        pipeline: 'compliance',
        stage: 'orchestrator_reset_stale',
        severity: 'warn',
        message: `Reset ${resetCount} stale running compliance sources to pending.`,
        metadata: {
          resetCount,
        },
      });
    }

    const sources = await claimDueSources(db, maxSources);
    const runId = await insertRun(db, trigger, sources.length);

    if (sources.length === 0) {
      await markRunCompleted(db, runId);
      await recordPipelineEvent(db, {
        pipeline: 'compliance',
        stage: 'orchestrator',
        severity: 'info',
        message: 'No due compliance sources for ingestion.',
        runId,
        metadata: {
          trigger,
          maxSources,
        },
      });
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

    await recordPipelineEvent(db, {
      pipeline: 'compliance',
      stage: 'orchestrator',
      severity: 'info',
      message: `Queued ${payloadSources.length} compliance sources for ingestion.`,
      runId,
      metadata: {
        trigger,
        maxSources,
        queued: payloadSources.length,
      },
    });
  };
}

export const handler = buildRunComplianceIngestionBatchHandler();
