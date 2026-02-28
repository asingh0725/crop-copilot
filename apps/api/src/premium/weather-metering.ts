import type { Pool, PoolClient } from 'pg';

interface WeatherUsageDailyRow {
  calls_made: number;
  paid_calls: number;
  cost_usd: string;
}

export interface OpenWeatherReservationResult {
  allowed: boolean;
  callNumber: number;
  incrementalCostUsd: number;
  totalCostUsd: number;
  reason?: 'hard_cap_reached';
}

function startOfUtcDayIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function toNumber(value: string | number | null | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function resolveDailyFreeCalls(): number {
  return Math.max(0, Math.floor(toNumber(process.env.OPENWEATHER_DAILY_FREE_CALLS, 1000)));
}

function resolveDailyHardCap(): number {
  const configured = Math.max(1, Math.floor(toNumber(process.env.OPENWEATHER_DAILY_HARD_CAP, 2000)));
  return Math.max(configured, resolveDailyFreeCalls());
}

function resolvePricePerCallUsd(): number {
  return Math.max(0, toNumber(process.env.OPENWEATHER_PRICE_PER_CALL_USD, 0.0015));
}

async function lockOrCreateUsageRow(
  client: PoolClient,
  provider: string,
  usageDate: string
): Promise<WeatherUsageDailyRow> {
  const existing = await client.query<WeatherUsageDailyRow>(
    `
      SELECT
        "callsMade" AS calls_made,
        "paidCalls" AS paid_calls,
        "costUsd"::text AS cost_usd
      FROM "WeatherApiUsageDaily"
      WHERE provider = $1
        AND "usageDate" = $2
      FOR UPDATE
    `,
    [provider, usageDate]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  await client.query(
    `
      INSERT INTO "WeatherApiUsageDaily" (
        provider,
        "usageDate",
        "callsMade",
        "paidCalls",
        "costUsd",
        metadata,
        "updatedAt"
      )
      VALUES ($1, $2, 0, 0, 0, '{}'::jsonb, NOW())
      ON CONFLICT (provider, "usageDate") DO NOTHING
    `,
    [provider, usageDate]
  );

  const inserted = await client.query<WeatherUsageDailyRow>(
    `
      SELECT
        "callsMade" AS calls_made,
        "paidCalls" AS paid_calls,
        "costUsd"::text AS cost_usd
      FROM "WeatherApiUsageDaily"
      WHERE provider = $1
        AND "usageDate" = $2
      FOR UPDATE
    `,
    [provider, usageDate]
  );

  return (
    inserted.rows[0] ?? {
      calls_made: 0,
      paid_calls: 0,
      cost_usd: '0',
    }
  );
}

export async function reserveOpenWeatherCall(
  pool: Pool,
  metadata: { recommendationId?: string } = {}
): Promise<OpenWeatherReservationResult> {
  const usageDate = startOfUtcDayIso();
  const dailyFreeCalls = resolveDailyFreeCalls();
  const dailyHardCap = resolveDailyHardCap();
  const pricePerCallUsd = resolvePricePerCallUsd();
  const provider = 'openweather';

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const usage = await lockOrCreateUsageRow(client, provider, usageDate);

    const nextCallsMade = usage.calls_made + 1;
    if (nextCallsMade > dailyHardCap) {
      await client.query('ROLLBACK');
      return {
        allowed: false,
        callNumber: usage.calls_made,
        incrementalCostUsd: 0,
        totalCostUsd: toNumber(usage.cost_usd, 0),
        reason: 'hard_cap_reached',
      };
    }

    const incrementalCostUsd = nextCallsMade > dailyFreeCalls ? pricePerCallUsd : 0;
    const nextPaidCalls = Math.max(0, nextCallsMade - dailyFreeCalls);
    const nextCostUsd = round6(toNumber(usage.cost_usd, 0) + incrementalCostUsd);

    await client.query(
      `
        UPDATE "WeatherApiUsageDaily"
        SET
          "callsMade" = $3,
          "paidCalls" = $4,
          "costUsd" = $5,
          metadata = jsonb_strip_nulls(
            COALESCE(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'lastRecommendationId', $6,
              'dailyFreeCalls', $7,
              'dailyHardCap', $8,
              'pricePerCallUsd', $9
            )
          ),
          "updatedAt" = NOW()
        WHERE provider = $1
          AND "usageDate" = $2
      `,
      [
        provider,
        usageDate,
        nextCallsMade,
        nextPaidCalls,
        nextCostUsd,
        metadata.recommendationId ?? null,
        dailyFreeCalls,
        dailyHardCap,
        pricePerCallUsd,
      ]
    );

    await client.query('COMMIT');

    return {
      allowed: true,
      callNumber: nextCallsMade,
      incrementalCostUsd: round6(incrementalCostUsd),
      totalCostUsd: nextCostUsd,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failures.
    }
    throw error;
  } finally {
    client.release();
  }
}
