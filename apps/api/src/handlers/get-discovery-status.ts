/**
 * GET /api/v1/admin/discovery/status
 *
 * Returns the current state of the full automated pipeline:
 *   Phase 1 — Gemini source discovery (CropRegionDiscovery)
 *   Phase 2 — Content ingestion / chunking / embedding (Source)
 *   Phase 3 — ML model training (MLModelVersion)
 *
 * Restricted to admin users (ADMIN_USER_IDS env var). If ADMIN_USER_IDS is
 * not set, any authenticated user can access this endpoint.
 */

import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { Pool } from 'pg';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse } from '../lib/http';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

interface DiscoveryRow {
  id: string;
  crop: string;
  region: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  sourcesFound: number;
  lastDiscoveredAt: string | null;
  createdAt: string;
}

interface StatusCountRow {
  status: string;
  count: string;
}

interface IngestionStatsRow {
  totalSources: string;
  totalChunks: string;
  pending: string;
  active: string;
  completed: string;
  error: string;
}

interface MLModelRow {
  id: string;
  modelType: string;
  trainedAt: string;
  feedbackCount: number;
  ndcgScore: number | null;
  s3Uri: string | null;
  status: string;
  createdAt: string;
}

interface AnalyticsRow {
  users: string;
  inputs: string;
  recommendations: string;
  avgConfidence: string | null;
  feedback: string;
  helpfulFeedback: string;
  evaluations: string;
  avgEvalScore: string | null;
}

interface ErrorSourceRow {
  id: string;
  title: string | null;
  url: string;
  errorMessage: string | null;
  updatedAt: string;
}

interface PipelineEventSummaryRow {
  info_count: string;
  warn_count: string;
  error_count: string;
}

interface PipelineEventRow {
  id: string;
  pipeline: string;
  stage: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  run_id: string | null;
  source_id: string | null;
  recommendation_id: string | null;
  user_id: string | null;
  url: string | null;
  metadata: unknown;
  created_at: string;
}

interface PipelineEventGroupCountRow {
  pipeline: string;
  severity: 'info' | 'warn' | 'error';
  count: string;
}

interface ComplianceIngestionStatsRow {
  total_sources: string;
  total_chunks: string;
  total_facts: string;
  pending: string;
  running: string;
  indexed: string;
  error: string;
}

interface ComplianceCoverageRow {
  total_cells: string;
  covered_cells: string;
  avg_coverage_score: string | null;
  stale_cells: string;
}

interface ComplianceRunRow {
  id: string;
  trigger: string;
  status: string;
  sources_queued: string;
  sources_processed: string;
  chunks_created: string;
  facts_extracted: string;
  errors: string;
  metadata: unknown;
  started_at: string;
  ended_at: string | null;
}

interface ComplianceRunFailedSource {
  sourceId: string;
  url: string;
  stage: string;
  message: string;
}

interface ComplianceRunMetadata {
  failedSources: ComplianceRunFailedSource[];
}

interface ComplianceErrorRow {
  id: string;
  title: string;
  url: string;
  state: string | null;
  crop: string | null;
  error_message: string | null;
  updated_at: string;
}

interface ComplianceDiscoveryQueueRow {
  id: string;
  state: string;
  crop: string;
  status: string;
  sources_found: string;
  last_discovered_at: string | null;
  created_at: string;
}

interface ComplianceSourceRow {
  id: string;
  title: string;
  url: string;
  state: string | null;
  crop: string | null;
  status: string;
  chunks_count: string;
  facts_count: string;
  last_fetched_at: string | null;
  last_indexed_at: string | null;
  error_message: string | null;
  updated_at: string;
}

interface ComplianceDashboardSnapshot {
  available: boolean;
  discovery: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    error: number;
    sourcesTotal: number;
    progressPct: number;
  };
  ingestion: {
    totalSources: number;
    pending: number;
    running: number;
    indexed: number;
    error: number;
    totalChunks: number;
    totalFacts: number;
  };
  coverage: {
    totalCells: number;
    coveredCells: number;
    avgCoverageScore: number;
    staleCells: number;
  };
  latestRun: {
    id: string;
    trigger: string;
    status: string;
    sourcesQueued: number;
    sourcesProcessed: number;
    chunksCreated: number;
    factsExtracted: number;
    errors: number;
    metadata: ComplianceRunMetadata;
    startedAt: string;
    endedAt: string | null;
  } | null;
  errors: {
    count: number;
    sample: Array<{
      id: string;
      title: string;
      url: string;
      state: string | null;
      crop: string | null;
      errorMessage: string | null;
      updatedAt: string;
    }>;
  };
  recentRuns: Array<{
    id: string;
    trigger: string;
    status: string;
    sourcesQueued: number;
    sourcesProcessed: number;
    chunksCreated: number;
    factsExtracted: number;
    errors: number;
    metadata: ComplianceRunMetadata;
    startedAt: string;
    endedAt: string | null;
  }>;
  discoveryRows: Array<{
    id: string;
    state: string;
    crop: string;
    status: string;
    sourcesFound: number;
    lastDiscoveredAt: string | null;
    createdAt: string;
  }>;
  sourceRows: Array<{
    id: string;
    title: string;
    url: string;
    state: string | null;
    crop: string | null;
    status: string;
    chunksCount: number;
    factsCount: number;
    lastFetchedAt: string | null;
    lastIndexedAt: string | null;
    errorMessage: string | null;
    updatedAt: string;
  }>;
  observability: {
    available: boolean;
    counts24h: {
      info: number;
      warn: number;
      error: number;
    };
    recentEvents: Array<{
      id: string;
      pipeline: string;
      stage: string;
      severity: 'info' | 'warn' | 'error';
      message: string;
      runId: string | null;
      sourceId: string | null;
      url: string | null;
      createdAt: string;
    }>;
  };
}

interface PgErrorLike {
  code?: string;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    pool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 6),
      ssl: resolvePoolSslConfig(),
    });
  }
  return pool;
}

function isAdminUser(userId: string): boolean {
  const adminIds = process.env.ADMIN_USER_IDS;
  if (!adminIds) return true;
  return adminIds
    .split(',')
    .map((id) => id.trim())
    .includes(userId);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isMissingTableError(error: unknown): boolean {
  const code = (error as PgErrorLike | null)?.code;
  return code === '42P01' || code === '42703';
}

function defaultComplianceSnapshot(): ComplianceDashboardSnapshot {
  return {
    available: false,
    discovery: {
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      error: 0,
      sourcesTotal: 0,
      progressPct: 0,
    },
    ingestion: {
      totalSources: 0,
      pending: 0,
      running: 0,
      indexed: 0,
      error: 0,
      totalChunks: 0,
      totalFacts: 0,
    },
    coverage: {
      totalCells: 0,
      coveredCells: 0,
      avgCoverageScore: 0,
      staleCells: 0,
    },
    latestRun: null,
    errors: {
      count: 0,
      sample: [],
    },
    recentRuns: [],
    discoveryRows: [],
    sourceRows: [],
    observability: {
      available: false,
      counts24h: {
        info: 0,
        warn: 0,
        error: 0,
      },
      recentEvents: [],
    },
  };
}

function toCount(value: string | null | undefined): number {
  return Number(value ?? 0);
}

function inferComplianceFailureStage(message: string): string {
  const normalized = message.toLowerCase();
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

function normalizeRunMetadata(raw: unknown): ComplianceRunMetadata {
  const defaultMetadata: ComplianceRunMetadata = { failedSources: [] };
  if (!raw || typeof raw !== 'object') {
    return defaultMetadata;
  }

  const failedSourcesRaw = (raw as { failedSources?: unknown }).failedSources;
  if (!Array.isArray(failedSourcesRaw)) {
    return defaultMetadata;
  }

  return {
    failedSources: failedSourcesRaw
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const sourceId = String((item as { sourceId?: unknown }).sourceId ?? '').trim();
        const url = String((item as { url?: unknown }).url ?? '').trim();
        const stage = String((item as { stage?: unknown }).stage ?? '').trim();
        const message = String((item as { message?: unknown }).message ?? '').trim();

        if (!sourceId && !url && !message) {
          return null;
        }

        const normalizedStage = stage.toLowerCase();
        const resolvedStage =
          normalizedStage && normalizedStage !== 'unknown'
            ? normalizedStage
            : inferComplianceFailureStage(message);

        return {
          sourceId,
          url,
          stage: resolvedStage,
          message,
        };
      })
      .filter((row): row is ComplianceRunFailedSource => row !== null),
  };
}

async function fetchComplianceSnapshot(db: Pool): Promise<ComplianceDashboardSnapshot> {
  try {
    const [
      discoveryCounts,
      discoverySourcesTotal,
      ingestionStatsResult,
      coverageResult,
      latestRunResult,
      errorRowsResult,
      discoveryRowsResult,
      sourceRowsResult,
    ] =
      await Promise.all([
        db.query<StatusCountRow>(
          `SELECT status, COUNT(*)::text AS count FROM "ComplianceDiscoveryQueue" GROUP BY status`
        ),
        db.query<{ total: string }>(
          `SELECT COALESCE(SUM("sourcesFound"), 0)::text AS total FROM "ComplianceDiscoveryQueue"`
        ),
        db.query<ComplianceIngestionStatsRow>(`
          SELECT
            COUNT(*)::text AS total_sources,
            COALESCE(SUM("chunksCount"), 0)::text AS total_chunks,
            COALESCE(SUM("factsCount"), 0)::text AS total_facts,
            COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
            COUNT(*) FILTER (WHERE status = 'running')::text AS running,
            COUNT(*) FILTER (WHERE status = 'indexed')::text AS indexed,
            COUNT(*) FILTER (WHERE status = 'error')::text AS error
          FROM "ComplianceSource"
        `),
        db.query<ComplianceCoverageRow>(`
          SELECT
            COUNT(*)::text AS total_cells,
            COUNT(*) FILTER (WHERE "coverageScore" >= 0.5)::text AS covered_cells,
            COALESCE(AVG("coverageScore"), 0)::text AS avg_coverage_score,
            COUNT(*) FILTER (
              WHERE "freshnessHours" IS NULL OR "freshnessHours" > 72
            )::text AS stale_cells
          FROM "ComplianceCoverage"
        `),
        db.query<ComplianceRunRow>(`
          SELECT
            id,
            trigger,
            status,
            "sourcesQueued" AS sources_queued,
            "sourcesProcessed" AS sources_processed,
            "chunksCreated" AS chunks_created,
            "factsExtracted" AS facts_extracted,
            errors::text AS errors,
            metadata,
            "startedAt" AS started_at,
            "endedAt" AS ended_at
          FROM "ComplianceIngestionRun"
          ORDER BY "startedAt" DESC
          LIMIT 10
        `),
        db.query<ComplianceErrorRow>(`
          SELECT
            id,
            title,
            url,
            state,
            crop,
            "errorMessage" AS error_message,
            "updatedAt" AS updated_at
          FROM "ComplianceSource"
          WHERE status = 'error'
          ORDER BY "updatedAt" DESC
          LIMIT 20
        `),
        db.query<ComplianceDiscoveryQueueRow>(`
          SELECT
            id,
            state,
            crop,
            status,
            "sourcesFound" AS sources_found,
            "lastDiscoveredAt" AS last_discovered_at,
            "createdAt" AS created_at
          FROM "ComplianceDiscoveryQueue"
          ORDER BY "lastDiscoveredAt" DESC NULLS LAST, state ASC, crop ASC
          LIMIT 200
        `),
        db.query<ComplianceSourceRow>(`
          SELECT
            id,
            title,
            url,
            state,
            crop,
            status,
            "chunksCount" AS chunks_count,
            "factsCount" AS facts_count,
            "lastFetchedAt" AS last_fetched_at,
            "lastIndexedAt" AS last_indexed_at,
            "errorMessage" AS error_message,
            "updatedAt" AS updated_at
          FROM "ComplianceSource"
          ORDER BY
            CASE status
              WHEN 'running' THEN 0
              WHEN 'error' THEN 1
              WHEN 'pending' THEN 2
              WHEN 'indexed' THEN 3
              ELSE 4
            END,
            "updatedAt" DESC
          LIMIT 200
        `),
      ]);

    const discovery = {
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      error: 0,
      sourcesTotal: toCount(discoverySourcesTotal.rows[0]?.total),
      progressPct: 0,
    };

    for (const row of discoveryCounts.rows) {
      const count = toCount(row.count);
      if (row.status === 'pending') discovery.pending = count;
      if (row.status === 'running') discovery.running = count;
      if (row.status === 'completed') discovery.completed = count;
      if (row.status === 'error') discovery.error = count;
      discovery.total += count;
    }
    discovery.progressPct =
      discovery.total > 0
        ? Math.round((discovery.completed / discovery.total) * 1000) / 10
        : 0;

    const ingestionRow = ingestionStatsResult.rows[0];
    const ingestion = {
      totalSources: toCount(ingestionRow?.total_sources),
      pending: toCount(ingestionRow?.pending),
      running: toCount(ingestionRow?.running),
      indexed: toCount(ingestionRow?.indexed),
      error: toCount(ingestionRow?.error),
      totalChunks: toCount(ingestionRow?.total_chunks),
      totalFacts: toCount(ingestionRow?.total_facts),
    };

    const coverageRow = coverageResult.rows[0];
    const coverage = {
      totalCells: toCount(coverageRow?.total_cells),
      coveredCells: toCount(coverageRow?.covered_cells),
      avgCoverageScore: Number(coverageRow?.avg_coverage_score ?? 0),
      staleCells: toCount(coverageRow?.stale_cells),
    };

    const latestRunRow = latestRunResult.rows[0];
    const latestRun = latestRunRow
      ? {
          id: latestRunRow.id,
          trigger: latestRunRow.trigger,
          status: latestRunRow.status,
          sourcesQueued: toCount(latestRunRow.sources_queued),
          sourcesProcessed: toCount(latestRunRow.sources_processed),
          chunksCreated: toCount(latestRunRow.chunks_created),
          factsExtracted: toCount(latestRunRow.facts_extracted),
          errors: toCount(latestRunRow.errors),
          metadata: normalizeRunMetadata(latestRunRow.metadata),
          startedAt: latestRunRow.started_at,
          endedAt: latestRunRow.ended_at,
        }
      : null;

    let complianceObservability: ComplianceDashboardSnapshot['observability'] = {
      available: false,
      counts24h: {
        info: 0,
        warn: 0,
        error: 0,
      },
      recentEvents: [],
    };

    try {
      const [observabilitySummaryResult, observabilityRowsResult] = await Promise.all([
        db.query<PipelineEventSummaryRow>(`
          SELECT
            COUNT(*) FILTER (WHERE severity = 'info')::text AS info_count,
            COUNT(*) FILTER (WHERE severity = 'warn')::text AS warn_count,
            COUNT(*) FILTER (WHERE severity = 'error')::text AS error_count
          FROM "PipelineEventLog"
          WHERE "createdAt" > NOW() - INTERVAL '24 hours'
            AND pipeline = 'compliance'
        `),
        db.query<PipelineEventRow>(`
          SELECT
            id,
            pipeline,
            stage,
            severity,
            message,
            "runId" AS run_id,
            "sourceId" AS source_id,
            "recommendationId" AS recommendation_id,
            "userId" AS user_id,
            url,
            metadata,
            "createdAt" AS created_at
          FROM "PipelineEventLog"
          WHERE pipeline = 'compliance'
          ORDER BY "createdAt" DESC
          LIMIT 80
        `),
      ]);

      complianceObservability = {
        available: true,
        counts24h: {
          info: toCount(observabilitySummaryResult.rows[0]?.info_count),
          warn: toCount(observabilitySummaryResult.rows[0]?.warn_count),
          error: toCount(observabilitySummaryResult.rows[0]?.error_count),
        },
        recentEvents: observabilityRowsResult.rows.map((row) => ({
          id: row.id,
          pipeline: row.pipeline,
          stage: row.stage,
          severity: row.severity,
          message: row.message,
          runId: row.run_id,
          sourceId: row.source_id,
          url: row.url,
          createdAt: row.created_at,
        })),
      };
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }

    return {
      available: true,
      discovery,
      ingestion,
      coverage,
      latestRun,
      errors: {
        count: ingestion.error,
        sample: errorRowsResult.rows.map((row) => ({
          id: row.id,
          title: row.title,
          url: row.url,
          state: row.state,
          crop: row.crop,
          errorMessage: row.error_message,
          updatedAt: row.updated_at,
        })),
      },
      recentRuns: latestRunResult.rows.map((row) => ({
        id: row.id,
        trigger: row.trigger,
        status: row.status,
        sourcesQueued: toCount(row.sources_queued),
        sourcesProcessed: toCount(row.sources_processed),
        chunksCreated: toCount(row.chunks_created),
        factsExtracted: toCount(row.facts_extracted),
        errors: toCount(row.errors),
        metadata: normalizeRunMetadata(row.metadata),
        startedAt: row.started_at,
        endedAt: row.ended_at,
      })),
      discoveryRows: discoveryRowsResult.rows.map((row) => ({
        id: row.id,
        state: row.state,
        crop: row.crop,
        status: row.status,
        sourcesFound: toCount(row.sources_found),
        lastDiscoveredAt: row.last_discovered_at,
        createdAt: row.created_at,
      })),
      sourceRows: sourceRowsResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        url: row.url,
        state: row.state,
        crop: row.crop,
        status: row.status,
        chunksCount: toCount(row.chunks_count),
        factsCount: toCount(row.facts_count),
        lastFetchedAt: row.last_fetched_at,
        lastIndexedAt: row.last_indexed_at,
        errorMessage: row.error_message,
        updatedAt: row.updated_at,
      })),
      observability: complianceObservability,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return defaultComplianceSnapshot();
    }
    throw error;
  }
}

export function buildGetDiscoveryStatusHandler(verifier?: AuthVerifier): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    if (!isAdminUser(auth.userId)) {
      return jsonResponse(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { statusCode: 403 }
      );
    }

    const query = event.queryStringParameters ?? {};
    const statusFilter = query.status as string | undefined;
    const cropFilter = query.crop?.trim() || undefined;
    const regionFilter = query.region?.trim() || undefined;
    const page = parsePositiveInt(query.page, 1);
    const pageSize = Math.min(parsePositiveInt(query.pageSize, 50), 200);
    const offset = (page - 1) * pageSize;

    const db = getPool();

    try {
      // ── Phase 1: Discovery stats ────────────────────────────────────────────
      const [statusCounts, totalSourcesFound] = await Promise.all([
        db.query<StatusCountRow>(
          `SELECT status, COUNT(*)::text AS count FROM "CropRegionDiscovery" GROUP BY status`
        ),
        db.query<{ total: string }>(
          `SELECT COALESCE(SUM("sourcesFound"), 0)::text AS total FROM "CropRegionDiscovery"`
        ),
      ]);

      const discoveryStats: Record<string, number> = {
        pending: 0,
        running: 0,
        completed: 0,
        error: 0,
      };
      let discoveryTotal = 0;
      for (const row of statusCounts.rows) {
        const count = Number(row.count);
        discoveryStats[row.status] = count;
        discoveryTotal += count;
      }
      const sourcesDiscovered = Number(totalSourcesFound.rows[0]?.total ?? 0);
      const discoveryPct =
        discoveryTotal > 0
          ? Math.round((discoveryStats.completed / discoveryTotal) * 1000) / 10
          : 0;

      // ── Phase 2: Ingestion stats ────────────────────────────────────────────
      // Source status values: pending → processed (chunked) → ready (embedded) | error
      const ingestionResult = await db.query<IngestionStatsRow>(`
        SELECT
          COUNT(*)::text                                            AS "totalSources",
          COALESCE(SUM("chunksCount"), 0)::text                    AS "totalChunks",
          COUNT(*) FILTER (WHERE status = 'pending')::text         AS pending,
          COUNT(*) FILTER (WHERE status = 'processed')::text       AS active,
          COUNT(*) FILTER (WHERE status = 'ready')::text           AS completed,
          COUNT(*) FILTER (WHERE status = 'error')::text           AS error
        FROM "Source"
      `);
      const ing = ingestionResult.rows[0];
      const ingestionStats = {
        totalSources: Number(ing?.totalSources ?? 0),
        totalChunks: Number(ing?.totalChunks ?? 0),
        pending: Number(ing?.pending ?? 0),
        active: Number(ing?.active ?? 0),
        completed: Number(ing?.completed ?? 0),
        error: Number(ing?.error ?? 0),
      };

      const compliance = await fetchComplianceSnapshot(db);

      // ── App analytics ───────────────────────────────────────────────────────
      const [analyticsResult, errorSourcesResult] = await Promise.all([
        db.query<AnalyticsRow>(`
          SELECT
            (SELECT COUNT(*)::text FROM "User")                                   AS users,
            (SELECT COUNT(*)::text FROM "Input")                                  AS inputs,
            (SELECT COUNT(*)::text FROM "Recommendation")                         AS recommendations,
            (SELECT ROUND(AVG(confidence)::numeric, 3)::text FROM "Recommendation") AS "avgConfidence",
            (SELECT COUNT(*)::text FROM "Feedback")                               AS feedback,
            (SELECT COUNT(*)::text FROM "Feedback" WHERE helpful = true)          AS "helpfulFeedback",
            (SELECT COUNT(*)::text FROM "Evaluation")                             AS evaluations,
            (SELECT ROUND(AVG(overall)::numeric, 2)::text FROM "Evaluation")      AS "avgEvalScore"
        `),
        db.query<ErrorSourceRow>(`
          SELECT id, title, url, "errorMessage", "updatedAt"
          FROM "Source"
          WHERE status = 'error'
          ORDER BY "updatedAt" DESC
          LIMIT 20
        `),
      ]);

      let observability = {
        available: false,
        counts24h: {
          info: 0,
          warn: 0,
          error: 0,
        },
        counts24hByPipeline: {} as Record<
          string,
          {
            info: number;
            warn: number;
            error: number;
          }
        >,
        recentEvents: [] as Array<{
          id: string;
          pipeline: string;
          stage: string;
          severity: 'info' | 'warn' | 'error';
          message: string;
          runId: string | null;
          sourceId: string | null;
          recommendationId: string | null;
          userId: string | null;
          url: string | null;
          metadata: unknown;
          createdAt: string;
        }>,
      };

      try {
        const [summaryResult, groupedResult, rowsResult] = await Promise.all([
          db.query<PipelineEventSummaryRow>(`
            SELECT
              COUNT(*) FILTER (WHERE severity = 'info')::text AS info_count,
              COUNT(*) FILTER (WHERE severity = 'warn')::text AS warn_count,
              COUNT(*) FILTER (WHERE severity = 'error')::text AS error_count
            FROM "PipelineEventLog"
            WHERE "createdAt" > NOW() - INTERVAL '24 hours'
          `),
          db.query<PipelineEventGroupCountRow>(`
            SELECT
              pipeline,
              severity,
              COUNT(*)::text AS count
            FROM "PipelineEventLog"
            WHERE "createdAt" > NOW() - INTERVAL '24 hours'
            GROUP BY pipeline, severity
          `),
          db.query<PipelineEventRow>(`
            SELECT
              id,
              pipeline,
              stage,
              severity,
              message,
              "runId" AS run_id,
              "sourceId" AS source_id,
              "recommendationId" AS recommendation_id,
              "userId" AS user_id,
              url,
              metadata,
              "createdAt" AS created_at
            FROM "PipelineEventLog"
            ORDER BY "createdAt" DESC
            LIMIT 120
          `),
        ]);

        observability = {
          available: true,
          counts24h: {
            info: toCount(summaryResult.rows[0]?.info_count),
            warn: toCount(summaryResult.rows[0]?.warn_count),
            error: toCount(summaryResult.rows[0]?.error_count),
          },
          counts24hByPipeline: groupedResult.rows.reduce<
            Record<string, { info: number; warn: number; error: number }>
          >((acc, row) => {
            if (!acc[row.pipeline]) {
              acc[row.pipeline] = {
                info: 0,
                warn: 0,
                error: 0,
              };
            }
            const bucket = acc[row.pipeline];
            bucket[row.severity] = toCount(row.count);
            return acc;
          }, {}),
          recentEvents: rowsResult.rows.map((row) => ({
            id: row.id,
            pipeline: row.pipeline,
            stage: row.stage,
            severity: row.severity,
            message: row.message,
            runId: row.run_id,
            sourceId: row.source_id,
            recommendationId: row.recommendation_id,
            userId: row.user_id,
            url: row.url,
            metadata: row.metadata,
            createdAt: row.created_at,
          })),
        };
      } catch (error) {
        if (!isMissingTableError(error)) {
          console.warn('[DiscoveryStatus] Failed to load pipeline observability events', {
            error: (error as Error).message,
          });
        }
      }

      const an = analyticsResult.rows[0];
      const analytics = {
        users: Number(an?.users ?? 0),
        inputs: Number(an?.inputs ?? 0),
        recommendations: Number(an?.recommendations ?? 0),
        avgConfidence: an?.avgConfidence != null ? Number(an.avgConfidence) : null,
        feedback: Number(an?.feedback ?? 0),
        helpfulFeedback: Number(an?.helpfulFeedback ?? 0),
        evaluations: Number(an?.evaluations ?? 0),
        avgEvalScore: an?.avgEvalScore != null ? Number(an.avgEvalScore) : null,
      };

      const errorSources = {
        count: Number(ing?.error ?? 0),
        sample: errorSourcesResult.rows.map((r) => ({
          id: r.id,
          title: r.title ?? null,
          url: r.url,
          errorMessage: r.errorMessage ?? null,
          updatedAt: r.updatedAt,
        })),
      };

      // ── Phase 3: ML model stats ─────────────────────────────────────────────
      const mlResult = await db.query<MLModelRow>(`
        SELECT id, "modelType", "trainedAt", "feedbackCount", "ndcgScore", "s3Uri", status, "createdAt"
        FROM "MLModelVersion"
        WHERE "modelType" = 'lambdarank'
        ORDER BY "trainedAt" DESC
        LIMIT 1
      `);
      const latestModel = mlResult.rows[0] ?? null;

      const premiumModelResult = await db.query<MLModelRow>(`
        SELECT id, "modelType", "trainedAt", "feedbackCount", "ndcgScore", "s3Uri", status, "createdAt"
        FROM "MLModelVersion"
        WHERE "modelType" = 'premium_quality'
        ORDER BY "trainedAt" DESC
        LIMIT 1
      `);
      const latestPremiumModel = premiumModelResult.rows[0] ?? null;

      // ── Filtered discovery rows ─────────────────────────────────────────────
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (statusFilter && ['pending', 'running', 'completed', 'error'].includes(statusFilter)) {
        params.push(statusFilter);
        conditions.push(`status = $${params.length}`);
      }
      if (cropFilter) {
        params.push(`%${cropFilter}%`);
        conditions.push(`crop ILIKE $${params.length}`);
      }
      if (regionFilter) {
        params.push(`%${regionFilter}%`);
        conditions.push(`region ILIKE $${params.length}`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const [countResult, rowsResult] = await Promise.all([
        db.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total FROM "CropRegionDiscovery" ${whereClause}`,
          params
        ),
        db.query<DiscoveryRow>(
          `SELECT
             id,
             crop,
             region,
             status,
             "sourcesFound",
             "lastDiscoveredAt",
             "createdAt"
           FROM "CropRegionDiscovery"
           ${whereClause}
           ORDER BY "lastDiscoveredAt" DESC NULLS LAST, crop ASC, region ASC
           OFFSET $${params.length + 1}
           LIMIT $${params.length + 2}`,
          [...params, offset, pageSize]
        ),
      ]);

      const filteredTotal = Number(countResult.rows[0]?.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

      const rows = rowsResult.rows.map((r) => ({
        id: r.id,
        crop: r.crop,
        region: r.region,
        status: r.status,
        sourcesFound: Number(r.sourcesFound),
        lastDiscoveredAt: r.lastDiscoveredAt ?? null,
        createdAt: r.createdAt,
      }));

      return jsonResponse(
        {
          // Phase 1 — source discovery
          stats: { total: discoveryTotal, ...discoveryStats },
          progress: { pct: discoveryPct, sourcesTotal: sourcesDiscovered },
          // Phase 2 — ingestion
          ingestion: ingestionStats,
          compliance,
          // Phase 3 — ML training
          latestModel: latestModel
            ? {
                id: latestModel.id,
                modelType: latestModel.modelType,
                status: latestModel.status,
                trainedAt: latestModel.trainedAt,
                feedbackCount: Number(latestModel.feedbackCount),
                ndcgScore: latestModel.ndcgScore != null ? Number(latestModel.ndcgScore) : null,
                s3Uri: latestModel.s3Uri ?? null,
              }
            : null,
          latestPremiumModel: latestPremiumModel
            ? {
                id: latestPremiumModel.id,
                modelType: latestPremiumModel.modelType,
                status: latestPremiumModel.status,
                trainedAt: latestPremiumModel.trainedAt,
                feedbackCount: Number(latestPremiumModel.feedbackCount),
                ndcgScore:
                  latestPremiumModel.ndcgScore != null
                    ? Number(latestPremiumModel.ndcgScore)
                    : null,
                s3Uri: latestPremiumModel.s3Uri ?? null,
              }
            : null,
          // App analytics
          analytics,
          // Error details
          errors: { sources: errorSources },
          observability,
          rows,
          pagination: { page, pageSize, total: filteredTotal, totalPages },
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('[DiscoveryStatus] Query failed:', (error as Error).message);
      return jsonResponse(
        { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
        { statusCode: 500 }
      );
    }
  }, verifier);
}

export const handler = buildGetDiscoveryStatusHandler();
