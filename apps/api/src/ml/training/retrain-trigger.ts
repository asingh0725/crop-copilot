/**
 * Automated in-house retraining trigger.
 *
 * Runs on a schedule or from feedback-triggered queue work. When enough new
 * feedback exists, it:
 *   1. Builds retrieval ranking examples from RetrievalAudit + Feedback
 *   2. Trains an in-house linear ranking artifact
 *   3. Deploys that artifact by updating MLModelVersion and persisting JSON
 *
 * No SageMaker training job or realtime endpoint is involved.
 */

import type { EventBridgeHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../../lib/store';
import { recordPipelineEvent } from '../../lib/pipeline-events';
import { buildFeatureVector, RETRIEVAL_FEATURE_NAMES } from '../reranker';
import {
  getDefaultModelArtifact,
  trainLinearRankingModel,
  type RankingExample,
} from '../in-house-models';
import { deployInHouseModelArtifact, retireModelVersion } from '../model-registry';

const DEFAULT_MIN_FEEDBACK = 50;

interface RetrainTriggerEvent {
  force?: boolean;
}

interface ChunkEntry {
  id: string;
  sourceId: string | null;
  similarity: number;
  rankScore: number;
  sourceType: string;
  cited: boolean;
  metadata?: { crops?: string[]; topics?: string[]; position?: number };
}

interface TrainingRow {
  recommendation_id: string;
  candidate_chunks: unknown;
  query_topics: unknown;
  query_crop: string | null;
  helpful: boolean | null;
  rating: number | null;
  outcome_success: boolean | null;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    pool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: 3,
      ssl: resolvePoolSslConfig(),
    });
  }
  return pool;
}

async function hasActiveTrainingRun(db: Pool): Promise<boolean> {
  const active = await db.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM "MLModelVersion"
      WHERE "modelType" = 'lambdarank'
        AND status = 'training'
        AND "createdAt" > NOW() - INTERVAL '12 hours'
    `,
  );
  return Number(active.rows[0]?.count ?? 0) > 0;
}

function parseChunks(raw: unknown): ChunkEntry[] {
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
          ? (item['metadata'] as ChunkEntry['metadata'])
          : undefined,
    }))
    .filter((chunk) => chunk.id.length > 0);
}

function parseTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((topic): topic is string => typeof topic === 'string').map((topic) => topic.toLowerCase());
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
  if (feedbackSignal < 0) return 0;
  return 1;
}

async function buildRetrievalTrainingExamples(db: Pool): Promise<RankingExample[]> {
  const boostResult = await db.query<{ source_id: string; boost: number }>(
    `SELECT "sourceId" AS source_id, boost FROM "SourceBoost"`,
  );
  const boostBySourceId = new Map<string, number>(boostResult.rows.map((row) => [row.source_id, row.boost]));

  const examples: RankingExample[] = [];
  const PAGE_SIZE = 500;
  let offset = 0;

  while (true) {
    const result = await db.query<TrainingRow>(
      `SELECT COALESCE(ra."recommendationId", resolved.id) AS recommendation_id,
              ra."candidateChunks" AS candidate_chunks,
              ra.topics AS query_topics,
              i.crop AS query_crop,
              f.helpful,
              f.rating,
              f."outcomeSuccess" AS outcome_success
       FROM "RetrievalAudit" ra
       LEFT JOIN LATERAL (
         SELECT r.id
         FROM "Recommendation" r
         WHERE r."inputId" = ra."inputId"
         ORDER BY ABS(EXTRACT(EPOCH FROM (r."createdAt" - ra."createdAt"))), r."createdAt" DESC
         LIMIT 1
       ) resolved ON TRUE
       LEFT JOIN "Input" i ON i.id = ra."inputId"
       INNER JOIN "Feedback" f ON f."recommendationId" = COALESCE(ra."recommendationId", resolved.id)
       WHERE COALESCE(ra."recommendationId", resolved.id) IS NOT NULL
       ORDER BY ra."createdAt" DESC
       LIMIT $1 OFFSET $2`,
      [PAGE_SIZE, offset],
    );

    if (result.rows.length === 0) {
      break;
    }

    for (const row of result.rows) {
      const chunks = parseChunks(row.candidate_chunks);
      if (chunks.length === 0) {
        continue;
      }

      const feedbackSignal = computeFeedbackSignal({
        helpful: row.helpful,
        rating: row.rating,
        outcomeSuccess: row.outcome_success,
      });
      const queryTerms = parseTopics(row.query_topics);
      const crop = row.query_crop ?? undefined;

      for (const chunk of chunks) {
        const label = computeLabel(chunk.cited, feedbackSignal);
        const features = buildFeatureVector(
          {
            chunkId: chunk.id,
            sourceId: chunk.sourceId ?? undefined,
            content: '',
            similarity: chunk.similarity,
            rankScore: chunk.rankScore,
            sourceType: chunk.sourceType as any,
            sourceTitle: '',
            sourceBoost: boostBySourceId.get(chunk.sourceId ?? '') ?? 0,
            metadata: chunk.metadata,
            scoreBreakdown: {
              vector: chunk.similarity,
              keyword: 0,
              authority: 0,
              metadata: 0,
            },
          },
          {
            crop,
            queryTerms,
          }
        );

        examples.push({
          qid: row.recommendation_id,
          label,
          features,
        });
      }
    }

    offset += PAGE_SIZE;
    if (result.rows.length < PAGE_SIZE) {
      break;
    }
  }

  return examples;
}

export const handler: EventBridgeHandler<
  'crop-copilot.ml.retrain.scheduled',
  RetrainTriggerEvent,
  void
> = async (event) => {
  const force = event.detail?.force ?? false;
  const minFeedback = Number(process.env.RETRAINING_MIN_FEEDBACK ?? DEFAULT_MIN_FEEDBACK);

  const db = getPool();

  const lastTrainedResult = await db.query<{ trained_at: Date }>(
    `SELECT "trainedAt" AS trained_at
     FROM "MLModelVersion"
     WHERE "modelType" = 'lambdarank' AND status = 'deployed'
     ORDER BY "trainedAt" DESC LIMIT 1`,
  );
  const lastTrainedAt = lastTrainedResult.rows[0]?.trained_at ?? new Date(0);

  const feedbackResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM "Feedback" WHERE "createdAt" > $1`,
    [lastTrainedAt.toISOString()],
  );
  const newFeedbackCount = Number(feedbackResult.rows[0]?.count ?? 0);

  if (!force && newFeedbackCount < minFeedback) {
    await recordPipelineEvent(db, {
      pipeline: 'learning',
      stage: 'retrain_check',
      severity: 'info',
      message: `Skipped lambdarank retrain: ${newFeedbackCount}/${minFeedback} feedback samples since last deploy.`,
      metadata: {
        modelType: 'lambdarank',
        force,
        newFeedbackCount,
        minFeedback,
        lastTrainedAt: lastTrainedAt.toISOString(),
      },
    });
    return;
  }

  if (await hasActiveTrainingRun(db)) {
    await recordPipelineEvent(db, {
      pipeline: 'learning',
      stage: 'retrain_check',
      severity: 'warn',
      message: 'Skipped lambdarank retrain because another training run is already active.',
      metadata: {
        modelType: 'lambdarank',
      },
    });
    return;
  }

  const versionResult = await db.query<{ id: string }>(
    `INSERT INTO "MLModelVersion" ("modelType", "feedbackCount", status, "createdAt", "trainedAt")
     VALUES ('lambdarank', $1, 'training', NOW(), NOW())
     RETURNING id`,
    [newFeedbackCount],
  );

  const modelVersionId = versionResult.rows[0]?.id;
  if (!modelVersionId) throw new Error('Failed to create MLModelVersion row');

  try {
    const examples = await buildRetrievalTrainingExamples(db);
    if (examples.length === 0) {
      throw new Error('No lambdarank training rows were exported from RetrievalAudit + Feedback');
    }

    const defaultArtifact = getDefaultModelArtifact('lambdarank', [...RETRIEVAL_FEATURE_NAMES]);
    const artifact = trainLinearRankingModel({
      modelType: 'lambdarank',
      featureNames: [...RETRIEVAL_FEATURE_NAMES],
      examples,
      defaultWeights: defaultArtifact.featureWeights,
    });

    const deployment = await deployInHouseModelArtifact(db, {
      modelVersionId,
      artifact,
      bucket: process.env.S3_TRAINING_BUCKET ?? null,
      region: process.env.AWS_REGION ?? 'us-west-2',
    });

    await recordPipelineEvent(db, {
      pipeline: 'learning',
      stage: 'retrain_deploy',
      severity: 'info',
      message: 'Deployed lambdarank artifact from in-house trainer.',
      metadata: {
        modelType: 'lambdarank',
        modelVersionId,
        samples: newFeedbackCount,
        trainingRows: examples.length,
        backend: artifact.backend,
        ndcgAt3: artifact.metrics.ndcgAt3,
        ndcgAt5: artifact.metrics.ndcgAt5,
        pairwiseAccuracy: artifact.metrics.pairwiseAccuracy,
        baselineNdcgAt3: artifact.metrics.baselineNdcgAt3,
        baselineNdcgAt5: artifact.metrics.baselineNdcgAt5,
        s3Uri: deployment.s3Uri,
      },
    });
  } catch (error) {
    await retireModelVersion(db, modelVersionId);
    await recordPipelineEvent(db, {
      pipeline: 'learning',
      stage: 'retrain_deploy',
      severity: 'error',
      message: `Lambdarank retrain failed: ${(error as Error).message}`,
      metadata: {
        modelType: 'lambdarank',
        modelVersionId,
      },
    });
    throw error;
  }
};
