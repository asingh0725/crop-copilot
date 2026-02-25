import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

const BOOST_INCREMENT = 0.03;
const MAX_BOOST = 0.25;
const MIN_BOOST = -0.1;
const OUTCOME_MULTIPLIER = 2;

// ─── Implicit feedback ──────────────────────────────────────────────────────

export interface ImplicitSignalInput {
  userId: string;
  recommendationId: string;
  eventType: 'recommendation_viewed' | 'product_clicked' | 'rediagnosed';
  durationMs?: number;
}

/**
 * Convert an implicit user event into a learning signal and update SourceBoost.
 *
 * Signal mapping:
 *   recommendation_viewed + durationMs >= 30s → weak positive (+0.5)
 *   product_clicked                           → moderate positive (+1)
 *   rediagnosed                               → moderate negative (−1, implies recommendation failed)
 */
export async function processImplicitSignal(
  pool: Pool,
  input: ImplicitSignalInput,
): Promise<void> {
  let signal = 0;

  if (input.eventType === 'rediagnosed') {
    signal = -1;
  } else if (input.eventType === 'product_clicked') {
    signal = 1;
  } else if (input.eventType === 'recommendation_viewed') {
    // Only a positive signal if the user spent meaningful time reading
    signal = (input.durationMs ?? 0) >= 30_000 ? 0.5 : 0;
  }

  if (signal === 0) return;

  const citedSourceIds = await loadCitedSourceIds(pool, input.recommendationId);
  const boostDelta = signal * BOOST_INCREMENT;
  for (const sourceId of citedSourceIds) {
    await upsertSourceBoost(pool, sourceId, boostDelta);
  }

  // Update per-topic affinities using the query terms from the audit
  const topics = await loadRecommendationTopics(pool, input.recommendationId);
  if (topics.length > 0) {
    for (const sourceId of citedSourceIds) {
      for (const topic of topics) {
        await upsertSourceTopicAffinity(pool, sourceId, topic, boostDelta);
      }
    }
  }
}

// ─── Topic affinity ─────────────────────────────────────────────────────────

async function loadRecommendationTopics(
  pool: Pool,
  recommendationId: string,
): Promise<string[]> {
  const result = await pool.query<{ topics: unknown }>(
    `SELECT topics FROM "RetrievalAudit"
     WHERE "recommendationId" = $1
     ORDER BY "createdAt" DESC LIMIT 1`,
    [recommendationId],
  );

  const raw = result.rows[0]?.topics;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === 'string').slice(0, 8);
}

async function upsertSourceTopicAffinity(
  pool: Pool,
  sourceId: string,
  topic: string,
  delta: number,
): Promise<void> {
  const existing = await pool.query<{ boost: number }>(
    `SELECT boost FROM "SourceTopicAffinity" WHERE "sourceId" = $1 AND topic = $2 LIMIT 1`,
    [sourceId, topic],
  );

  const current = existing.rows[0]?.boost ?? 0;
  const next = clamp(current + delta, MIN_BOOST, MAX_BOOST);

  await pool.query(
    `INSERT INTO "SourceTopicAffinity" (id, "sourceId", topic, boost, "sampleCount", "updatedAt")
     VALUES ($1, $2, $3, $4, 1, NOW())
     ON CONFLICT ("sourceId", topic) DO UPDATE SET
       boost         = EXCLUDED.boost,
       "sampleCount" = "SourceTopicAffinity"."sampleCount" + 1,
       "updatedAt"   = NOW()`,
    [randomUUID(), sourceId, topic, next],
  );
}

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

  // Per-topic affinity update using query terms stored in the retrieval audit
  const topics = await loadRecommendationTopics(pool, signalInput.recommendationId);
  if (topics.length > 0) {
    for (const sourceId of citedSourceIds) {
      for (const topic of topics) {
        await upsertSourceTopicAffinity(pool, sourceId, topic, boostDelta);
      }
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
