import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

interface CountRow {
  count: string;
}

function toInt(value: string | undefined): number {
  return Number.parseInt(value ?? '0', 10) || 0;
}

async function getNullCount(pool: Pool): Promise<number> {
  const result = await pool.query<CountRow>(
    `SELECT COUNT(*)::text AS count FROM "RetrievalAudit" WHERE "recommendationId" IS NULL`
  );
  return toInt(result.rows[0]?.count);
}

async function getRecoverableCount(pool: Pool): Promise<number> {
  const result = await pool.query<CountRow>(
    `
      WITH ranked AS (
        SELECT
          ra.id AS retrieval_id,
          r.id AS recommendation_id,
          ROW_NUMBER() OVER (
            PARTITION BY ra.id
            ORDER BY ABS(EXTRACT(EPOCH FROM (r."createdAt" - ra."createdAt"))), r."createdAt" DESC
          ) AS rn
        FROM "RetrievalAudit" ra
        JOIN "Recommendation" r
          ON r."inputId" = ra."inputId"
        WHERE ra."recommendationId" IS NULL
      )
      SELECT COUNT(*)::text AS count
      FROM ranked
      WHERE rn = 1
    `
  );
  return toInt(result.rows[0]?.count);
}

async function applyBackfill(pool: Pool): Promise<number> {
  const result = await pool.query<CountRow>(
    `
      WITH ranked AS (
        SELECT
          ra.id AS retrieval_id,
          r.id AS recommendation_id,
          ROW_NUMBER() OVER (
            PARTITION BY ra.id
            ORDER BY ABS(EXTRACT(EPOCH FROM (r."createdAt" - ra."createdAt"))), r."createdAt" DESC
          ) AS rn
        FROM "RetrievalAudit" ra
        JOIN "Recommendation" r
          ON r."inputId" = ra."inputId"
        WHERE ra."recommendationId" IS NULL
      ),
      chosen AS (
        SELECT retrieval_id, recommendation_id
        FROM ranked
        WHERE rn = 1
      ),
      updated AS (
        UPDATE "RetrievalAudit" ra
        SET "recommendationId" = chosen.recommendation_id
        FROM chosen
        WHERE ra.id = chosen.retrieval_id
        RETURNING ra.id
      )
      SELECT COUNT(*)::text AS count
      FROM updated
    `
  );

  return toInt(result.rows[0]?.count);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const dryRun = hasFlag('--dry-run');
  const pool = new Pool({
    connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
    max: Number(process.env.PG_POOL_MAX ?? 4),
    ssl: resolvePoolSslConfig(),
  });

  try {
    const nullBefore = await getNullCount(pool);
    const recoverable = await getRecoverableCount(pool);
    const updated = dryRun ? 0 : await applyBackfill(pool);
    const nullAfter = dryRun ? nullBefore : await getNullCount(pool);

    console.log(
      JSON.stringify(
        {
          dryRun,
          nullBefore,
          recoverable,
          updated,
          nullAfter,
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[BackfillRetrievalAuditRecommendationIds] fatal', {
    error: (error as Error).message,
  });
  process.exit(1);
});
