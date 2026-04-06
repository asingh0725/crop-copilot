import type { EventBridgeHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../../lib/store';
import { recordPipelineEvent } from '../../lib/pipeline-events';
import {
  getDefaultModelArtifact,
  trainLinearRankingModel,
  type RankingExample,
} from '../in-house-models';
import { PREMIUM_FEATURE_NAMES, buildPremiumFeatureVector } from '../premium-quality';
import { deployInHouseModelArtifact, retireModelVersion } from '../model-registry';

const DEFAULT_MIN_PREMIUM_FEEDBACK = 30;

interface PremiumRetrainTriggerEvent {
  force?: boolean;
}

interface PremiumTrainingRow {
  recommendation_id: string;
  decision: string | null;
  checks: unknown;
  cost_analysis: unknown;
  spray_windows: unknown;
  report: unknown;
  helpful: boolean | null;
  rating: number | null;
  accuracy: number | null;
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

function computeFeedbackSignal(row: PremiumTrainingRow): number {
  if (row.outcome_success === true) return 2;
  if (row.outcome_success === false) return -2;

  let signal = 0;
  if (row.helpful === true) signal += 1;
  if (row.helpful === false) signal -= 1;

  if (typeof row.rating === 'number') {
    if (row.rating >= 4) signal += 1;
    if (row.rating <= 2) signal -= 1;
  }

  if (typeof row.accuracy === 'number') {
    if (row.accuracy >= 4) signal += 1;
    if (row.accuracy <= 2) signal -= 1;
  }

  return Math.max(-2, Math.min(2, signal));
}

async function buildPremiumTrainingExamples(
  db: Pool,
  lastTrainedAt: Date
): Promise<RankingExample[]> {
  const examples: RankingExample[] = [];
  const PAGE_SIZE = 500;
  let offset = 0;

  while (true) {
    const result = await db.query<PremiumTrainingRow>(
      `
        SELECT
          rpi."recommendationId" AS recommendation_id,
          rpi."complianceDecision" AS decision,
          rpi.checks,
          rpi."costAnalysis" AS cost_analysis,
          rpi."sprayWindows" AS spray_windows,
          rpi.report,
          f.helpful,
          f.rating,
          f.accuracy,
          f."outcomeSuccess" AS outcome_success
        FROM "RecommendationPremiumInsight" rpi
        INNER JOIN "Feedback" f
          ON f."recommendationId" = rpi."recommendationId"
        WHERE f."createdAt" > $1
        ORDER BY f."createdAt" DESC
        LIMIT $2 OFFSET $3
      `,
      [lastTrainedAt.toISOString(), PAGE_SIZE, offset]
    );

    if (result.rows.length === 0) {
      break;
    }

    for (const row of result.rows) {
      const signal = computeFeedbackSignal(row);
      const label: 0 | 1 | 2 = signal > 0 ? 2 : signal < 0 ? 0 : 1;
      const features = buildPremiumFeatureVector({
        decision: row.decision,
        checks: row.checks,
        costAnalysis: row.cost_analysis,
        sprayWindows: row.spray_windows,
        report: row.report,
      });
      examples.push({
        qid: row.recommendation_id,
        label,
        features: [...features],
      });

      examples.push({
        qid: row.recommendation_id,
        label: 0,
        features: [0, 0, 0, 0, 0, 0, 0],
      });
    }

    offset += PAGE_SIZE;
    if (result.rows.length < PAGE_SIZE) {
      break;
    }
  }

  return examples;
}

async function hasActiveTrainingRun(db: Pool): Promise<boolean> {
  const result = await db.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM "MLModelVersion"
      WHERE "modelType" = 'premium_quality'
        AND status = 'training'
        AND "createdAt" > NOW() - INTERVAL '12 hours'
    `,
  );
  return Number(result.rows[0]?.count ?? 0) > 0;
}

export const handler: EventBridgeHandler<
  'crop-copilot.ml.premium-retrain.scheduled',
  PremiumRetrainTriggerEvent,
  void
> = async (event) => {
  const force = event.detail?.force ?? false;
  const db = getPool();

  const minFeedback = Number(
    process.env.PREMIUM_RETRAINING_MIN_FEEDBACK ?? DEFAULT_MIN_PREMIUM_FEEDBACK
  );

  const lastTrainedResult = await db.query<{ trained_at: Date }>(
    `
      SELECT "trainedAt" AS trained_at
      FROM "MLModelVersion"
      WHERE "modelType" = 'premium_quality' AND status = 'deployed'
      ORDER BY "trainedAt" DESC
      LIMIT 1
    `,
  );
  const lastTrainedAt = lastTrainedResult.rows[0]?.trained_at ?? new Date(0);

  const newFeedbackResult = await db.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM "Feedback" f
      INNER JOIN "RecommendationPremiumInsight" rpi
        ON rpi."recommendationId" = f."recommendationId"
      WHERE f."createdAt" > $1
    `,
    [lastTrainedAt.toISOString()]
  );

  const newFeedbackCount = Number(newFeedbackResult.rows[0]?.count ?? 0);

  if (!force && newFeedbackCount < minFeedback) {
    await recordPipelineEvent(db, {
      pipeline: 'learning',
      stage: 'premium_retrain_check',
      severity: 'info',
      message: `Skipped premium retrain: ${newFeedbackCount}/${minFeedback} premium feedback samples since last deploy.`,
      metadata: {
        modelType: 'premium_quality',
        force,
        newFeedbackCount,
        minFeedback,
      },
    });
    return;
  }

  if (await hasActiveTrainingRun(db)) {
    await recordPipelineEvent(db, {
      pipeline: 'learning',
      stage: 'premium_retrain_check',
      severity: 'warn',
      message: 'Skipped premium retrain because another premium training run is already active.',
      metadata: {
        modelType: 'premium_quality',
      },
    });
    return;
  }

  const versionResult = await db.query<{ id: string }>(
    `
      INSERT INTO "MLModelVersion" ("modelType", "feedbackCount", status, "createdAt", "trainedAt")
      VALUES ('premium_quality', $1, 'training', NOW(), NOW())
      RETURNING id
    `,
    [newFeedbackCount]
  );
  const modelVersionId = versionResult.rows[0]?.id;
  if (!modelVersionId) throw new Error('Failed to create premium MLModelVersion row');

  try {
    const examples = await buildPremiumTrainingExamples(db, lastTrainedAt);
    if (examples.length === 0) {
      throw new Error('No premium training rows were exported');
    }

    const defaultArtifact = getDefaultModelArtifact('premium_quality', [...PREMIUM_FEATURE_NAMES]);
    const artifact = trainLinearRankingModel({
      modelType: 'premium_quality',
      featureNames: [...PREMIUM_FEATURE_NAMES],
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
      stage: 'premium_retrain_deploy',
      severity: 'info',
      message: 'Deployed premium quality artifact from in-house trainer.',
      metadata: {
        modelType: 'premium_quality',
        modelVersionId,
        feedbackCount: newFeedbackCount,
        trainingRows: examples.length,
        backend: artifact.backend,
        ndcgAt3: artifact.metrics.ndcgAt3,
        ndcgAt5: artifact.metrics.ndcgAt5,
        pairwiseAccuracy: artifact.metrics.pairwiseAccuracy,
        s3Uri: deployment.s3Uri,
      },
    });
  } catch (error) {
    await retireModelVersion(db, modelVersionId);
    await recordPipelineEvent(db, {
      pipeline: 'learning',
      stage: 'premium_retrain_deploy',
      severity: 'error',
      message: `Premium retrain failed: ${(error as Error).message}`,
      metadata: {
        modelType: 'premium_quality',
        modelVersionId,
      },
    });
    throw error;
  }
};
