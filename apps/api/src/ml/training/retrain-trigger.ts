/**
 * Automated retraining trigger (EventBridge Lambda)
 *
 * Runs on a schedule (e.g. nightly at 2 AM UTC).
 * Checks if enough new Feedback rows have accumulated since the last
 * training run. If so:
 *   1. Exports training data from Postgres to S3 (CSV)
 *   2. Kicks off a SageMaker Training Job using the exported CSV
 *   3. Records the new version in MLModelVersion table
 *
 * Environment variables:
 *   DATABASE_URL                — Postgres connection string
 *   RETRAINING_MIN_FEEDBACK     — Minimum new Feedback rows before retraining (default 50)
 *   S3_TRAINING_BUCKET          — S3 bucket for training data export and model artifacts
 *   SAGEMAKER_TRAINING_JOB_NAME — Base name for training jobs (default: cropcopilot-ltr)
 *   SAGEMAKER_TRAINING_IMAGE    — ECR image URI for the LightGBM training container
 *   SAGEMAKER_ROLE_ARN          — IAM role ARN for SageMaker jobs
 *   AWS_REGION                  — AWS region (defaults to us-east-1)
 */

import type { EventBridgeHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../../lib/store';

const DEFAULT_MIN_FEEDBACK = 50;

interface RetrainTriggerEvent {
  force?: boolean; // Skip the feedback count check and always retrain
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

// ── Training data export helpers ─────────────────────────────────────────────

const AUTHORITY_SCORES: Record<string, number> = {
  GOVERNMENT: 1.0,
  UNIVERSITY_EXTENSION: 0.9,
  RESEARCH_PAPER: 0.85,
  MANUFACTURER: 0.6,
  RETAILER: 0.4,
  OTHER: 0.5,
};

interface ChunkEntry {
  id: string;
  sourceId: string | null;
  similarity: number;
  rankScore: number;
  sourceType: string;
  cited: boolean;
  metadata?: { crops?: string[]; topics?: string[]; position?: number };
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
    .filter((c) => c.id.length > 0);
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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Export training data from Postgres directly to S3 as a CSV file.
 * Returns the S3 URI of the uploaded file.
 */
async function exportTrainingDataToS3(db: Pool, bucket: string, region: string): Promise<string> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({ region });

  // Pre-load source boosts for the feature vector
  const boostResult = await db.query<{ source_id: string; boost: number }>(
    `SELECT "sourceId" AS source_id, boost FROM "SourceBoost"`,
  );
  const boostBySourceId = new Map<string, number>(
    boostResult.rows.map((r) => [r.source_id, r.boost]),
  );

  const csvLines: string[] = [
    'qid,label,f0_similarity,f1_rank_score,f2_authority,f3_source_boost,f4_crop_match,f5_term_density,f6_chunk_pos',
  ];

  const PAGE_SIZE = 500;
  let offset = 0;

  while (true) {
    const result = await db.query<{
      recommendation_id: string;
      candidate_chunks: unknown;
      query_topics: unknown;
      query_crop: string | null;
      helpful: boolean | null;
      rating: number | null;
      outcome_success: boolean | null;
    }>(
      `SELECT ra."recommendationId" AS recommendation_id,
              ra."candidateChunks"  AS candidate_chunks,
              ra.topics             AS query_topics,
              i.crop                AS query_crop,
              f.helpful,
              f.rating,
              f."outcomeSuccess"    AS outcome_success
       FROM "RetrievalAudit" ra
       LEFT JOIN "Input"    i ON i.id = ra."inputId"
       LEFT JOIN "Feedback" f ON f."recommendationId" = ra."recommendationId"
       ORDER BY ra."createdAt" DESC
       LIMIT $1 OFFSET $2`,
      [PAGE_SIZE, offset],
    );

    if (result.rows.length === 0) break;

    for (const row of result.rows) {
      const chunks = parseChunks(row.candidate_chunks);
      if (chunks.length === 0) continue;

      const signal = computeFeedbackSignal({
        helpful: row.helpful,
        rating: row.rating,
        outcomeSuccess: row.outcome_success,
      });

      const queryTopics = parseTopics(row.query_topics);
      const queryCrop = (row.query_crop ?? '').toLowerCase().trim();

      for (const chunk of chunks) {
        const label: 0 | 1 | 2 = !chunk.cited ? 0 : signal > 0 ? 2 : 1;
        const authority = AUTHORITY_SCORES[chunk.sourceType] ?? AUTHORITY_SCORES['OTHER']!;
        const sourceBoost = clamp(boostBySourceId.get(chunk.sourceId ?? '') ?? 0, -0.1, 0.25);
        const similarity = clamp(chunk.similarity, 0, 1);
        const rankScore = clamp(chunk.rankScore, 0, 1);

        const chunkCrops = (chunk.metadata?.crops ?? []).map((c) => c.toLowerCase());
        const cropMatch = queryCrop.length > 0 && chunkCrops.includes(queryCrop) ? 1 : 0;

        const chunkTopics = (chunk.metadata?.topics ?? []).map((t) => t.toLowerCase());
        const termDensity =
          queryTopics.length > 0
            ? queryTopics.filter(
                (t) => chunkTopics.includes(t) || chunkTopics.some((ct) => ct.includes(t)),
              ).length / queryTopics.length
            : 0;

        const chunkPos = Math.min(1, (chunk.metadata?.position ?? 0) / 10);

        csvLines.push(
          `${row.recommendation_id},${label},` +
            `${similarity.toFixed(6)},${rankScore.toFixed(6)},` +
            `${authority.toFixed(2)},${sourceBoost.toFixed(4)},` +
            `${cropMatch},${termDensity.toFixed(4)},${chunkPos.toFixed(4)}`,
        );
      }
    }

    offset += PAGE_SIZE;
    if (result.rows.length < PAGE_SIZE) break;
  }

  const s3Key = 'training-data/latest/training.csv';
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: Buffer.from(csvLines.join('\n'), 'utf-8'),
      ContentType: 'text/csv',
    }),
  );

  const rowCount = csvLines.length - 1; // subtract header
  console.log(`[RetrainTrigger] Exported ${rowCount} training rows to s3://${bucket}/${s3Key}`);

  return `s3://${bucket}/training-data/latest/`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export const handler: EventBridgeHandler<
  'crop-copilot.ml.retrain.scheduled',
  RetrainTriggerEvent,
  void
> = async (event) => {
  const force = event.detail?.force ?? false;
  const minFeedback = Number(process.env.RETRAINING_MIN_FEEDBACK ?? DEFAULT_MIN_FEEDBACK);

  const db = getPool();

  // Find last successful training run
  const lastTrainedResult = await db.query<{ trained_at: Date }>(
    `SELECT "trainedAt" AS trained_at
     FROM "MLModelVersion"
     WHERE "modelType" = 'lambdarank' AND status = 'deployed'
     ORDER BY "trainedAt" DESC LIMIT 1`,
  );

  const lastTrainedAt = lastTrainedResult.rows[0]?.trained_at ?? new Date(0);

  // Count new feedback since last training
  const feedbackResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM "Feedback" WHERE "createdAt" > $1`,
    [lastTrainedAt.toISOString()],
  );

  const newFeedbackCount = Number(feedbackResult.rows[0]?.count ?? 0);

  console.log(
    `[RetrainTrigger] New feedback since ${lastTrainedAt.toISOString()}: ` +
      `${newFeedbackCount} (threshold: ${minFeedback})`,
  );

  if (!force && newFeedbackCount < minFeedback) {
    console.log('[RetrainTrigger] Not enough new feedback — skipping retraining');
    return;
  }

  const bucket = process.env.S3_TRAINING_BUCKET;
  const roleArn = process.env.SAGEMAKER_ROLE_ARN;
  const trainingImage = process.env.SAGEMAKER_TRAINING_IMAGE;
  const jobBaseName = process.env.SAGEMAKER_TRAINING_JOB_NAME ?? 'cropcopilot-ltr';
  const region = process.env.AWS_REGION ?? 'us-east-1';

  if (!bucket || !roleArn || !trainingImage) {
    console.warn(
      '[RetrainTrigger] Missing S3_TRAINING_BUCKET / SAGEMAKER_ROLE_ARN / SAGEMAKER_TRAINING_IMAGE ' +
        '— SageMaker job skipped. Set these env vars to enable automated retraining.',
    );
    return;
  }

  // Create an MLModelVersion row with status=training
  const versionResult = await db.query<{ id: string }>(
    `INSERT INTO "MLModelVersion" ("modelType", "feedbackCount", status, "createdAt", "trainedAt")
     VALUES ('lambdarank', $1, 'training', NOW(), NOW())
     RETURNING id`,
    [newFeedbackCount],
  );

  const modelVersionId = versionResult.rows[0]?.id;
  if (!modelVersionId) throw new Error('Failed to create MLModelVersion row');

  try {
    // Step 1: Export training data from Postgres to S3
    const s3TrainingDataPath = await exportTrainingDataToS3(db, bucket, region);

    // Step 2: Submit SageMaker training job
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const jobName = `${jobBaseName}-${timestamp}`;
    const s3OutputPath = `s3://${bucket}/models/${jobName}/`;

    const { SageMakerClient, CreateTrainingJobCommand } = await import(
      '@aws-sdk/client-sagemaker'
    );

    const sm = new SageMakerClient({ region });

    await sm.send(
      new CreateTrainingJobCommand({
        TrainingJobName: jobName,
        AlgorithmSpecification: {
          TrainingImage: trainingImage,
          TrainingInputMode: 'File',
        },
        RoleArn: roleArn,
        InputDataConfig: [
          {
            ChannelName: 'training',
            DataSource: {
              S3DataSource: {
                S3DataType: 'S3Prefix',
                S3Uri: s3TrainingDataPath,
                S3DataDistributionType: 'FullyReplicated',
              },
            },
            ContentType: 'text/csv',
          },
        ],
        OutputDataConfig: {
          S3OutputPath: s3OutputPath,
        },
        ResourceConfig: {
          InstanceType: 'ml.m5.large',
          InstanceCount: 1,
          VolumeSizeInGB: 10,
        },
        StoppingCondition: {
          MaxRuntimeInSeconds: 3600,
        },
        HyperParameters: {
          model_version_id: modelVersionId,
        },
        Tags: [
          { Key: 'Project', Value: 'CropCopilot' },
          { Key: 'ModelVersionId', Value: modelVersionId },
        ],
      }),
    );

    console.log(`[RetrainTrigger] SageMaker training job submitted: ${jobName}`);

    await db.query(
      `UPDATE "MLModelVersion" SET "s3Uri" = $1, "updatedAt" = NOW() WHERE id = $2`,
      [`${s3OutputPath}output/model.tar.gz`, modelVersionId],
    );
  } catch (error) {
    console.error('[RetrainTrigger] Job submission failed:', (error as Error).message);
    await db.query(
      `UPDATE "MLModelVersion" SET status = 'retired', "updatedAt" = NOW() WHERE id = $1`,
      [modelVersionId],
    );
    throw error;
  }
};
