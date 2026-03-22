import { Pool } from 'pg';
import { runPremiumEnrichment } from '../premium/enrichment-service';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

interface BackfillRow {
  recommendation_id: string;
  user_id: string;
}

function parseNumberFlag(flagName: string, fallback: number): number {
  const index = process.argv.findIndex((arg) => arg === `--${flagName}`);
  if (index < 0 || index + 1 >= process.argv.length) {
    return fallback;
  }
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBooleanFlag(flagName: string, fallback: boolean): boolean {
  const index = process.argv.findIndex((arg) => arg === `--${flagName}`);
  if (index < 0) {
    return fallback;
  }
  if (index + 1 >= process.argv.length) {
    return true;
  }
  const value = process.argv[index + 1].trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(value)) {
    return false;
  }
  return true;
}

async function loadTargets(params: {
  pool: Pool;
  limit: number;
  onlyMissingCost: boolean;
}): Promise<BackfillRow[]> {
  const { pool, limit, onlyMissingCost } = params;
  const result = await pool.query<BackfillRow>(
    `
      SELECT
        r.id AS recommendation_id,
        r."userId" AS user_id
      FROM "Recommendation" r
      INNER JOIN "RecommendationPremiumInsight" rpi
        ON rpi."recommendationId" = r.id
      INNER JOIN "Input" i
        ON i.id = r."inputId"
      WHERE rpi.status = 'ready'
        AND i."fieldAcreage" IS NOT NULL
        AND (
          $2::boolean = false
          OR rpi."costAnalysis" IS NULL
          OR (rpi."costAnalysis"->>'perAcreTotalUsd') IS NULL
          OR (rpi."costAnalysis"->>'wholeFieldTotalUsd') IS NULL
        )
      ORDER BY r."createdAt" DESC
      LIMIT $1
    `,
    [limit, onlyMissingCost]
  );
  return result.rows;
}

async function summarizeCoverage(pool: Pool): Promise<{ eligible: number; withTotals: number }> {
  const result = await pool.query<{ eligible: string; with_totals: string }>(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE rpi.status = 'ready'
            AND i."fieldAcreage" IS NOT NULL
        )::text AS eligible,
        COUNT(*) FILTER (
          WHERE rpi.status = 'ready'
            AND i."fieldAcreage" IS NOT NULL
            AND rpi."costAnalysis" IS NOT NULL
            AND (rpi."costAnalysis"->>'perAcreTotalUsd') IS NOT NULL
        )::text AS with_totals
      FROM "RecommendationPremiumInsight" rpi
      LEFT JOIN "Recommendation" r ON r.id = rpi."recommendationId"
      LEFT JOIN "Input" i ON i.id = r."inputId"
    `
  );

  return {
    eligible: Number(result.rows[0]?.eligible ?? 0),
    withTotals: Number(result.rows[0]?.with_totals ?? 0),
  };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const limit = parseNumberFlag('limit', 5000);
  const concurrency = parseNumberFlag('concurrency', 4);
  const onlyMissingCost = parseBooleanFlag('only-missing-cost', true);

  const pool = new Pool({
    connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
    ssl: resolvePoolSslConfig(),
    max: Math.max(4, concurrency + 2),
  });

  try {
    const targets = await loadTargets({
      pool,
      limit,
      onlyMissingCost,
    });

    console.log(
      JSON.stringify(
        {
          step: 'targets_loaded',
          count: targets.length,
          limit,
          concurrency,
          onlyMissingCost,
        },
        null,
        2
      )
    );

    if (targets.length === 0) {
      const summary = await summarizeCoverage(pool);
      console.log(
        JSON.stringify(
          {
            step: 'summary',
            ...summary,
            coverage:
              summary.eligible > 0 ? Number((summary.withTotals / summary.eligible).toFixed(4)) : null,
          },
          null,
          2
        )
      );
      return;
    }

    let cursor = 0;
    let success = 0;
    let failed = 0;
    const failures: Array<{ recommendationId: string; message: string }> = [];

    async function worker(): Promise<void> {
      while (true) {
        const next = targets[cursor];
        cursor += 1;
        if (!next) {
          return;
        }
        try {
          await runPremiumEnrichment({
            pool,
            userId: next.user_id,
            recommendationId: next.recommendation_id,
          });
          success += 1;
        } catch (error) {
          failed += 1;
          failures.push({
            recommendationId: next.recommendation_id,
            message: (error as Error).message,
          });
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, targets.length) }, () => worker())
    );

    const summary = await summarizeCoverage(pool);
    console.log(
      JSON.stringify(
        {
          step: 'complete',
          processed: targets.length,
          success,
          failed,
          coverage:
            summary.eligible > 0 ? Number((summary.withTotals / summary.eligible).toFixed(4)) : null,
          eligible: summary.eligible,
          withTotals: summary.withTotals,
          sampleFailures: failures.slice(0, 10),
        },
        null,
        2
      )
    );

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
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
