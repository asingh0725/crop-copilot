import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { processLearningSignal } from '../learning/feedback-learning';

interface FeedbackRow {
  id: string;
  recommendation_id: string;
  helpful: boolean | null;
  rating: number | null;
  accuracy: number | null;
  outcome_success: boolean | null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseNumberArg(flag: string, fallback: number): number {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index < 0) return fallback;
  const raw = Number(process.argv[index + 1]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const dryRun = hasFlag('--dry-run');
  const limit = parseNumberArg('--limit', 2000);

  const pool = new Pool({
    connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
    max: Number(process.env.PG_POOL_MAX ?? 4),
    ssl: resolvePoolSslConfig(),
  });

  try {
    const rows = await pool.query<FeedbackRow>(
      `
        SELECT
          id,
          "recommendationId" AS recommendation_id,
          helpful,
          rating,
          accuracy,
          "outcomeSuccess" AS outcome_success
        FROM "Feedback"
        ORDER BY "updatedAt" ASC
        LIMIT $1
      `,
      [limit]
    );

    let applied = 0;
    let failed = 0;
    const failures: Array<{ id: string; recommendationId: string; error: string }> = [];

    for (const row of rows.rows) {
      if (dryRun) {
        applied += 1;
        continue;
      }

      try {
        await processLearningSignal(pool, {
          recommendationId: row.recommendation_id,
          helpful: row.helpful ?? undefined,
          rating: row.rating ?? undefined,
          accuracy: row.accuracy ?? undefined,
          outcomeSuccess: row.outcome_success ?? undefined,
        });
        applied += 1;
      } catch (error) {
        failed += 1;
        failures.push({
          id: row.id,
          recommendationId: row.recommendation_id,
          error: (error as Error).message,
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          dryRun,
          scanned: rows.rows.length,
          applied,
          failed,
          failures: failures.slice(0, 25),
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
  console.error('[ReplayFeedbackLearning] fatal', {
    error: (error as Error).message,
  });
  process.exit(1);
});
