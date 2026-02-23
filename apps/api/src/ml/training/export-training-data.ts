#!/usr/bin/env node
/**
 * Export retrieval training data for the SageMaker LambdaRank model.
 *
 * Joins RetrievalAudit + Feedback + SourceBoost and writes one CSV row per
 * (recommendation, candidate-chunk) pair. Pipe output to a file and
 * pass it to train-ranker.py.
 *
 * CSV columns:
 *   qid              - recommendation ID (LTR query group)
 *   label            - 0 = not cited, 1 = cited / neutral, 2 = cited + positive feedback
 *   f0_similarity    - vector similarity score (0–1)
 *   f1_rank_score    - hybrid rank score (0–1)
 *   f2_authority     - source authority encoded as float
 *   f3_source_boost  - SourceBoost.boost value (−0.1 to 0.25)
 *   f4_crop_match    - 1 if query crop ∈ chunk metadata.crops else 0
 *   f5_term_density  - fraction of query topics found in chunk content (0–1)
 *   f6_chunk_pos     - normalised chunk position within source (0–1, capped at 1)
 *
 * Usage:
 *   DATABASE_URL=postgres://... tsx export-training-data.ts > training.csv
 */

import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../../lib/store';

const AUTHORITY_SCORES: Record<string, number> = {
  GOVERNMENT: 1.0,
  UNIVERSITY_EXTENSION: 0.9,
  RESEARCH_PAPER: 0.85,
  MANUFACTURER: 0.6,
  RETAILER: 0.4,
  OTHER: 0.5,
};

interface CandidateChunkEntry {
  id: string;
  sourceId: string | null;
  similarity: number;
  rankScore: number;
  sourceType: string;
  cited: boolean;
  metadata?: {
    crops?: string[];
    topics?: string[];
    position?: number;
  };
}

interface AuditRow {
  recommendation_id: string;
  candidate_chunks: unknown;
  query_topics: unknown;
  query_crop: string | null;
  helpful: boolean | null;
  rating: number | null;
  outcome_success: boolean | null;
}

interface BoostRow {
  source_id: string;
  boost: number;
}

const PAGE_SIZE = 500;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write('ERROR: DATABASE_URL environment variable is required\n');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
    max: 3,
    ssl: resolvePoolSslConfig(),
  });

  try {
    // Pre-load source boosts for the feature vector
    const boostResult = await pool.query<BoostRow>(
      `SELECT "sourceId" AS source_id, boost FROM "SourceBoost"`,
    );
    const boostBySourceId = new Map<string, number>(
      boostResult.rows.map((r) => [r.source_id, r.boost]),
    );

    process.stdout.write(
      'qid,label,f0_similarity,f1_rank_score,f2_authority,f3_source_boost,f4_crop_match,f5_term_density,f6_chunk_pos\n',
    );

    let offset = 0;
    let totalRows = 0;

    while (true) {
      const result = await pool.query<AuditRow>(
        `
          SELECT
            ra."recommendationId"       AS recommendation_id,
            ra."candidateChunks"        AS candidate_chunks,
            ra.topics                   AS query_topics,
            i.crop                      AS query_crop,
            f.helpful,
            f.rating,
            f."outcomeSuccess"          AS outcome_success
          FROM "RetrievalAudit" ra
          LEFT JOIN "Input"    i ON i.id = ra."inputId"
          LEFT JOIN "Feedback" f ON f."recommendationId" = ra."recommendationId"
          ORDER BY ra."createdAt" DESC
          LIMIT $1 OFFSET $2
        `,
        [PAGE_SIZE, offset],
      );

      if (result.rows.length === 0) break;

      for (const row of result.rows) {
        const chunks = parseCandidateChunks(row.candidate_chunks);
        if (chunks.length === 0) continue;

        const feedbackSignal = computeFeedbackSignal({
          helpful: row.helpful,
          rating: row.rating,
          outcomeSuccess: row.outcome_success,
        });

        const queryTopics = parseTopics(row.query_topics);
        const queryCrop = (row.query_crop ?? '').toLowerCase().trim();

        for (const chunk of chunks) {
          const label = computeLabel(chunk.cited, feedbackSignal);
          const authority = AUTHORITY_SCORES[chunk.sourceType] ?? AUTHORITY_SCORES['OTHER']!;
          const sourceBoost = clamp(boostBySourceId.get(chunk.sourceId ?? '') ?? 0, -0.1, 0.25);
          const similarity = clamp(Number(chunk.similarity), 0, 1);
          const rankScore = clamp(Number(chunk.rankScore), 0, 1);

          // f4: crop match — 1 if query crop appears in chunk metadata.crops
          const chunkCrops = (chunk.metadata?.crops ?? []).map((c) => c.toLowerCase());
          const cropMatch =
            queryCrop.length > 0 && chunkCrops.length > 0 && chunkCrops.includes(queryCrop)
              ? 1
              : 0;

          // f5: query term density — fraction of query topics found in chunk
          const chunkTopics = (chunk.metadata?.topics ?? []).map((t) => t.toLowerCase());
          const termDensity =
            queryTopics.length > 0
              ? queryTopics.filter((t) => chunkTopics.includes(t) || chunkTopics.some((ct) => ct.includes(t))).length /
                queryTopics.length
              : 0;

          // f6: normalised chunk position within source (0 = first, 1 = position 10+)
          const chunkPos = Math.min(1, (chunk.metadata?.position ?? 0) / 10);

          process.stdout.write(
            `${row.recommendation_id},${label},` +
              `${similarity.toFixed(6)},${rankScore.toFixed(6)},` +
              `${authority.toFixed(2)},${sourceBoost.toFixed(4)},` +
              `${cropMatch},${termDensity.toFixed(4)},${chunkPos.toFixed(4)}\n`,
          );
          totalRows += 1;
        }
      }

      offset += PAGE_SIZE;
      if (result.rows.length < PAGE_SIZE) break;
    }

    process.stderr.write(`Exported ${totalRows} training examples.\n`);
  } finally {
    await pool.end();
  }
}

function parseCandidateChunks(raw: unknown): CandidateChunkEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({
      id: String(item['id'] ?? ''),
      sourceId: typeof item['sourceId'] === 'string' ? item['sourceId'] : null,
      similarity: Number(item['similarity'] ?? 0),
      rankScore: Number(item['rankScore'] ?? 0),
      sourceType: typeof item['sourceType'] === 'string' ? item['sourceType'] : 'OTHER',
      cited: Boolean(item['cited']),
      metadata:
        item['metadata'] && typeof item['metadata'] === 'object'
          ? (item['metadata'] as CandidateChunkEntry['metadata'])
          : undefined,
    }))
    .filter((chunk) => chunk.id.length > 0);
}

function parseTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === 'string').map((t) => t.toLowerCase());
}

function computeFeedbackSignal(params: {
  helpful: boolean | null;
  rating: number | null;
  outcomeSuccess: boolean | null;
}): number {
  const { helpful, rating, outcomeSuccess } = params;
  if (outcomeSuccess === true) return 2;
  if (outcomeSuccess === false) return -2;

  let signal = 0;
  if (helpful === true) signal += 1;
  else if (helpful === false) signal -= 1;
  if (typeof rating === 'number') {
    if (rating >= 4) signal += 1;
    else if (rating <= 2) signal -= 1;
  }
  return Math.max(-2, Math.min(2, signal));
}

function computeLabel(cited: boolean, feedbackSignal: number): 0 | 1 | 2 {
  if (!cited) return 0;
  if (feedbackSignal > 0) return 2;
  return 1;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${(error as Error).message}\n`);
  process.exit(1);
});
