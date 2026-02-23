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
        ORDER BY "trainedAt" DESC
        LIMIT 1
      `);
      const latestModel = mlResult.rows[0] ?? null;

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
          // App analytics
          analytics,
          // Error details
          errors: { sources: errorSources },
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
