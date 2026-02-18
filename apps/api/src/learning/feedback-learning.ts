import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

const BOOST_INCREMENT = 0.03;
const MAX_BOOST = 0.25;
const MIN_BOOST = -0.1;
const OUTCOME_MULTIPLIER = 2;

export interface FeedbackLearningSignal {
  recommendationId: string;
  helpful?: boolean;
  rating?: number;
  accuracy?: number;
  outcomeSuccess?: boolean;
}

export async function processLearningSignal(
  pool: Pool,
  signalInput: FeedbackLearningSignal
): Promise<void> {
  const signal = computeSignal(signalInput);
  if (signal === 0) {
    return;
  }

  const citedSourceIds = await loadCitedSourceIds(pool, signalInput.recommendationId);
  if (citedSourceIds.length === 0) {
    return;
  }

  const boostDelta = signal * BOOST_INCREMENT;
  for (const sourceId of citedSourceIds) {
    await upsertSourceBoost(pool, sourceId, boostDelta);
  }

  if (signal < 0) {
    const missedSourceIds = await loadMissedSourceIds(pool, signalInput.recommendationId);
    for (const sourceId of missedSourceIds.slice(0, 3)) {
      await upsertSourceBoost(pool, sourceId, BOOST_INCREMENT);
    }
  }
}

export function computeSignal(params: {
  helpful?: boolean;
  rating?: number;
  accuracy?: number;
  outcomeSuccess?: boolean;
}): number {
  const { helpful, rating, accuracy, outcomeSuccess } = params;
  if (outcomeSuccess === true) {
    return OUTCOME_MULTIPLIER;
  }
  if (outcomeSuccess === false) {
    return -OUTCOME_MULTIPLIER;
  }

  let signal = 0;

  if (helpful === true) {
    signal += 1;
  } else if (helpful === false) {
    signal -= 1;
  }

  if (typeof rating === 'number') {
    if (rating >= 4) {
      signal += 1;
    } else if (rating <= 2) {
      signal -= 1;
    }
  }

  if (typeof accuracy === 'number') {
    if (accuracy >= 4) {
      signal += 1;
    } else if (accuracy <= 2) {
      signal -= 1;
    }
  }

  return Math.max(-2, Math.min(2, signal));
}

async function loadCitedSourceIds(pool: Pool, recommendationId: string): Promise<string[]> {
  const result = await pool.query<{ source_id: string }>(
    `
      SELECT DISTINCT COALESCE(tc."sourceId", ic."sourceId") AS source_id
      FROM "RecommendationSource" rs
      LEFT JOIN "TextChunk" tc ON tc.id = rs."textChunkId"
      LEFT JOIN "ImageChunk" ic ON ic.id = rs."imageChunkId"
      WHERE rs."recommendationId" = $1
        AND COALESCE(tc."sourceId", ic."sourceId") IS NOT NULL
    `,
    [recommendationId]
  );

  return result.rows.map((row) => row.source_id);
}

async function loadMissedSourceIds(pool: Pool, recommendationId: string): Promise<string[]> {
  const result = await pool.query<{ missed_chunks: unknown }>(
    `
      SELECT "missedChunks" AS missed_chunks
      FROM "RetrievalAudit"
      WHERE "recommendationId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 1
    `,
    [recommendationId]
  );

  if (result.rows.length === 0) {
    return [];
  }

  const missedChunks = result.rows[0].missed_chunks;
  if (!Array.isArray(missedChunks)) {
    return [];
  }

  const sourceIds = new Set<string>();
  for (const chunk of missedChunks) {
    if (!chunk || typeof chunk !== 'object') {
      continue;
    }

    const sourceId = (chunk as Record<string, unknown>).sourceId;
    if (typeof sourceId === 'string' && sourceId.length > 0) {
      sourceIds.add(sourceId);
    }
  }

  return Array.from(sourceIds);
}

async function upsertSourceBoost(pool: Pool, sourceId: string, delta: number): Promise<void> {
  const existing = await pool.query<{ boost: number }>(
    `
      SELECT boost
      FROM "SourceBoost"
      WHERE "sourceId" = $1
      LIMIT 1
    `,
    [sourceId]
  );

  const currentBoost = existing.rows[0]?.boost ?? 0;
  const newBoost = clamp(currentBoost + delta, MIN_BOOST, MAX_BOOST);

  await pool.query(
    `
      INSERT INTO "SourceBoost" (
        id,
        "sourceId",
        boost,
        "feedbackCount",
        "updatedAt"
      )
      VALUES ($1, $2, $3, 1, NOW())
      ON CONFLICT ("sourceId") DO UPDATE
        SET boost = EXCLUDED.boost,
            "feedbackCount" = "SourceBoost"."feedbackCount" + 1,
            "updatedAt" = NOW()
    `,
    [randomUUID(), sourceId, newBoost]
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
