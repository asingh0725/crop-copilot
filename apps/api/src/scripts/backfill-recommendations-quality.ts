import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { getRecommendationStore } from '../lib/store';
import { getRuntimePool } from '../lib/runtime-pool';
import { runRecommendationPipeline } from '../pipeline/recommendation-pipeline';
import { runPremiumEnrichment } from '../premium/enrichment-service';

interface BackfillTargetRow {
  recommendation_id: string;
  input_id: string;
  user_id: string;
  model_used: string | null;
  recommendation_count: number;
  missing_citations: boolean;
  unknown_diagnosis: boolean;
}

interface BackfillResult {
  target: BackfillTargetRow;
  recommendationId: string;
  modelUsed: string;
}

function parseDurationFlag(name: string, fallbackMs: number): number {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index < 0 || index + 1 >= process.argv.length) {
    return fallbackMs;
  }
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallbackMs;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function parseNumberFlag(name: string, fallback: number): number {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index < 0 || index + 1 >= process.argv.length) {
    return fallback;
  }
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseBooleanFlag(name: string, fallback: boolean): boolean {
  if (!hasFlag(name)) {
    return fallback;
  }
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  const next = process.argv[index + 1];
  if (!next || next.startsWith('--')) {
    return true;
  }
  const normalized = next.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return true;
}

async function loadTargets(params: {
  pool: Pool;
  limit: number;
  includeAll: boolean;
}): Promise<BackfillTargetRow[]> {
  const result = await params.pool.query<BackfillTargetRow>(
    `
      WITH base AS (
        SELECT
          r.id AS recommendation_id,
          r."inputId" AS input_id,
          r."userId" AS user_id,
          r."modelUsed" AS model_used,
          COALESCE(jsonb_array_length(r.diagnosis->'recommendations'), 0) AS recommendation_count,
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(r.diagnosis->'recommendations', '[]'::jsonb)) AS rec
            WHERE COALESCE(jsonb_array_length(rec->'citations'), 0) = 0
          ) AS missing_citations,
          (
            lower(COALESCE(r.diagnosis->'diagnosis'->>'conditionType', '')) = 'unknown'
            OR lower(COALESCE(r.diagnosis->'diagnosis'->>'condition', '')) LIKE '%unknown%'
            OR lower(COALESCE(r.diagnosis->'diagnosis'->>'condition', '')) LIKE '%uncertain%'
          ) AS unknown_diagnosis
        FROM "Recommendation" r
      )
      SELECT
        recommendation_id,
        input_id,
        user_id,
        model_used,
        recommendation_count,
        missing_citations,
        unknown_diagnosis
      FROM base
      WHERE
        $2::boolean = true
        OR recommendation_count < 3
        OR missing_citations = true
        OR unknown_diagnosis = true
        OR lower(COALESCE(model_used, '')) LIKE 'heuristic%'
      ORDER BY recommendation_id DESC
      LIMIT $1
    `,
    [params.limit, params.includeAll]
  );

  return result.rows;
}

async function createBackfillJob(pool: Pool, target: BackfillTargetRow, jobId: string): Promise<void> {
  await pool.query(
    `
      INSERT INTO app_input_command (
        id,
        user_id,
        idempotency_key,
        payload,
        created_at,
        updated_at
      )
      SELECT
        i.id::uuid,
        i."userId"::uuid,
        'backfill:' || i.id::text,
        jsonb_strip_nulls(
          jsonb_build_object(
            'type', i.type,
            'idempotencyKey', 'backfill:' || i.id::text,
            'imageUrl', i."imageUrl",
            'description', i.description,
            'labData', i."labData",
            'location', i.location,
            'crop', i.crop,
            'season', i.season,
            'fieldAcreage', i."fieldAcreage",
            'plannedApplicationDate', i."plannedApplicationDate",
            'fieldLatitude', i."fieldLatitude",
            'fieldLongitude', i."fieldLongitude"
          )
        ),
        NOW(),
        NOW()
      FROM "Input" i
      WHERE i.id = $1::text
        AND i."userId" = $2::text
      ON CONFLICT (id) DO NOTHING
    `,
    [target.input_id, target.user_id]
  );

  await pool.query(
    `
      INSERT INTO app_recommendation_job (
        id,
        input_id,
        user_id,
        status,
        created_at,
        updated_at
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'queued', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `,
    [jobId, target.input_id, target.user_id]
  );
}

async function refreshSingleRecommendation(params: {
  pool: Pool;
  target: BackfillTargetRow;
  refreshPremium: boolean;
}): Promise<BackfillResult> {
  const { target, refreshPremium } = params;
  const store = getRecommendationStore();
  const jobId = randomUUID();

  await createBackfillJob(params.pool, target, jobId);
  await store.updateJobStatus(jobId, target.user_id, 'retrieving_context');
  await store.updateJobStatus(jobId, target.user_id, 'generating_recommendation');
  await store.updateJobStatus(jobId, target.user_id, 'validating_output');

  const result = await runRecommendationPipeline({
    inputId: target.input_id,
    userId: target.user_id,
    jobId,
  });

  await store.saveRecommendationResult(jobId, target.user_id, result);
  await store.updateJobStatus(jobId, target.user_id, 'persisting_result');
  await store.updateJobStatus(jobId, target.user_id, 'completed');

  if (refreshPremium) {
    await runPremiumEnrichment({
      pool: getRuntimePool(),
      userId: target.user_id,
      recommendationId: target.recommendation_id,
    });
  }

  return {
    target,
    recommendationId: target.recommendation_id,
    modelUsed: result.modelUsed,
  };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  if ((process.env.DATA_BACKEND ?? '').trim().toLowerCase() !== 'postgres') {
    throw new Error('DATA_BACKEND=postgres is required for recommendation backfill.');
  }

  const limit = parseNumberFlag('limit', 500);
  const concurrency = parseNumberFlag('concurrency', 2);
  const includeAll = parseBooleanFlag('all', false);
  const refreshPremium = parseBooleanFlag('refresh-premium', true);
  const dryRun = parseBooleanFlag('dry-run', false);
  const perTargetTimeoutMs = parseDurationFlag(
    'per-target-timeout-ms',
    Number(process.env.BACKFILL_PER_TARGET_TIMEOUT_MS ?? 180_000)
  );

  // Backfills should not consume user plan quota or overage credits.
  process.env.RECOMMENDATION_BACKFILL_SKIP_USAGE_METERING = 'true';

  const pool = getRuntimePool();
  const targets = await loadTargets({
    pool,
    limit,
    includeAll,
  });

  console.log(
    JSON.stringify(
        {
          step: 'targets_loaded',
          count: targets.length,
          limit,
          concurrency,
          includeAll,
          refreshPremium,
          perTargetTimeoutMs,
          dryRun,
        },
        null,
        2
      )
  );

  if (targets.length === 0 || dryRun) {
    return;
  }

  const successes: BackfillResult[] = [];
  const failures: Array<{ target: BackfillTargetRow; message: string }> = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const target = targets[cursor];
      cursor += 1;
      if (!target) {
        return;
      }

      try {
        const refreshed = await withTimeout(
          refreshSingleRecommendation({
            pool,
            target,
            refreshPremium,
          }),
          perTargetTimeoutMs,
          `backfill target ${target.recommendation_id}`
        );
        successes.push(refreshed);
      } catch (error) {
        failures.push({
          target,
          message: (error as Error).message,
        });
      }

      const processed = successes.length + failures.length;
      console.log(
        JSON.stringify(
          {
            step: 'progress',
            processed,
            total: targets.length,
            succeeded: successes.length,
            failed: failures.length,
            recommendationId: target.recommendation_id,
          },
          null,
          2
        )
      );
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, () => worker())
  );

  const modelCounts = successes.reduce<Record<string, number>>((acc, item) => {
    acc[item.modelUsed] = (acc[item.modelUsed] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        step: 'complete',
        processed: targets.length,
        succeeded: successes.length,
        failed: failures.length,
        modelCounts,
        sampleFailures: failures.slice(0, 20).map((entry) => ({
          recommendationId: entry.target.recommendation_id,
          inputId: entry.target.input_id,
          message: entry.message,
        })),
      },
      null,
      2
    )
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        step: 'fatal',
        message: (error as Error).message,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
