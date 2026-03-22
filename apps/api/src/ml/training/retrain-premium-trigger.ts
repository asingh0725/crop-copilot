import type { EventBridgeHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../../lib/store';
import { recordPipelineEvent } from '../../lib/pipeline-events';

const DEFAULT_MIN_PREMIUM_FEEDBACK = 30;

interface PremiumRetrainTriggerEvent {
  force?: boolean;
}

type TrainingBackend = 'lightgbm_custom' | 'xgboost_builtin';

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

function toArray(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object');
}

function toObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  return raw as Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveTrainingBackend(raw: string | undefined): TrainingBackend {
  const normalized = (raw ?? '').trim().toLowerCase();
  if (normalized === 'xgboost' || normalized === 'xgboost_builtin' || normalized === 'builtin') {
    return 'xgboost_builtin';
  }
  return 'lightgbm_custom';
}

function decisionScore(decision: string | null): number {
  if (decision === 'clear_signal') return 0.9;
  if (decision === 'potential_conflict') return 0.35;
  if (decision === 'needs_manual_verification') return 0.5;
  return 0.4;
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

function featureVector(row: PremiumTrainingRow): [number, number, number, number, number, number, number] {
  const checks = toArray(row.checks);
  const checkCount = checks.length;
  const clearSignals = checks.filter((check) => check.result === 'clear_signal').length;
  const conflicts = checks.filter((check) => check.result === 'potential_conflict').length;

  const costAnalysis = toObject(row.cost_analysis);
  const perAcre = toNumber(costAnalysis.perAcreTotalUsd) ?? 0;
  const wholeField = toNumber(costAnalysis.wholeFieldTotalUsd) ?? 0;
  const hasCostTotals = perAcre > 0 || wholeField > 0 ? 1 : 0;

  const sprayWindows = toArray(row.spray_windows);
  const liveWindows = sprayWindows.filter((window) => {
    const source = String(window.source ?? '').toLowerCase();
    return source.length > 0 && source !== 'fallback';
  }).length;

  const report = toObject(row.report);
  const hasReport = report.htmlUrl || report.pdfUrl ? 1 : 0;

  const checksNorm = Math.min(1, checkCount / 6);
  const clearRatio = checkCount > 0 ? clearSignals / checkCount : 0;
  const conflictRatio = checkCount > 0 ? conflicts / checkCount : 0;
  const liveWeatherRatio = sprayWindows.length > 0 ? liveWindows / sprayWindows.length : 0;

  return [
    decisionScore(row.decision),
    checksNorm,
    clearRatio,
    conflictRatio,
    hasCostTotals,
    liveWeatherRatio,
    hasReport,
  ];
}

function serializeTrainingRow(
  qid: string,
  label: 0 | 1 | 2,
  features: [number, number, number, number, number, number, number],
  backend: TrainingBackend,
): string {
  const featureCsv =
    `${features[0].toFixed(6)},${features[1].toFixed(6)},${features[2].toFixed(6)},` +
    `${features[3].toFixed(6)},${features[4].toFixed(6)},${features[5].toFixed(6)},${features[6].toFixed(6)}`;
  if (backend === 'xgboost_builtin') {
    return `${label},${featureCsv}`;
  }
  return `${qid},${label},${featureCsv}`;
}

async function exportPremiumTrainingDataToS3(
  db: Pool,
  bucket: string,
  region: string,
  lastTrainedAt: Date,
  backend: TrainingBackend
): Promise<{ s3PrefixUri: string; rowCount: number }> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({ region });

  const csvLines: string[] =
    backend === 'xgboost_builtin'
      ? []
      : [
          'qid,label,f0_similarity,f1_rank_score,f2_authority,f3_source_boost,f4_crop_match,f5_term_density,f6_chunk_pos',
        ];

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

    if (result.rows.length === 0) break;

    for (const row of result.rows) {
      const signal = computeFeedbackSignal(row);
      const label: 0 | 1 | 2 = signal > 0 ? 2 : signal < 0 ? 0 : 1;
      const features = featureVector(row);
      csvLines.push(serializeTrainingRow(row.recommendation_id, label, features, backend));

      // Add a simple baseline candidate per recommendation so each qid has competition.
      csvLines.push(
        serializeTrainingRow(row.recommendation_id, 0, [0, 0, 0, 0, 0, 0, 0], backend)
      );
    }

    offset += PAGE_SIZE;
    if (result.rows.length < PAGE_SIZE) break;
  }

  const rowCount = csvLines.length - (backend === 'xgboost_builtin' ? 0 : 1);
  if (rowCount <= 0) {
    throw new Error('No premium training rows were exported');
  }

  const s3Key = 'training-data/premium-quality/latest/training.csv';
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: Buffer.from(csvLines.join('\n'), 'utf-8'),
      ContentType: 'text/csv',
    })
  );

  return {
    s3PrefixUri: `s3://${bucket}/training-data/premium-quality/latest/`,
    rowCount,
  };
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

  const bucket = process.env.S3_TRAINING_BUCKET;
  const roleArn = process.env.SAGEMAKER_ROLE_ARN;
  const trainingImage =
    process.env.SAGEMAKER_PREMIUM_TRAINING_IMAGE || process.env.SAGEMAKER_TRAINING_IMAGE;
  const trainingBackend = resolveTrainingBackend(
    process.env.SAGEMAKER_PREMIUM_TRAINING_BACKEND ?? process.env.SAGEMAKER_TRAINING_BACKEND
  );
  const jobBaseName =
    process.env.SAGEMAKER_PREMIUM_TRAINING_JOB_NAME ?? 'cropcopilot-premium-quality';
  const region = process.env.AWS_REGION ?? 'us-east-1';

  if (!bucket || !roleArn || !trainingImage) {
    await recordPipelineEvent(db, {
      pipeline: 'learning',
      stage: 'premium_retrain_check',
      severity: 'warn',
      message:
        'Skipped premium retrain because S3_TRAINING_BUCKET / SAGEMAKER_ROLE_ARN / SAGEMAKER_PREMIUM_TRAINING_IMAGE is not fully configured.',
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
    const exportResult = await exportPremiumTrainingDataToS3(
      db,
      bucket,
      region,
      lastTrainedAt,
      trainingBackend
    );
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const jobName = `${jobBaseName}-${timestamp}`;
    const s3OutputPath = `s3://${bucket}/models/${jobName}/`;

    const { SageMakerClient, CreateTrainingJobCommand } = await import(
      '@aws-sdk/client-sagemaker'
    );
    const sm = new SageMakerClient({ region });
    const channelName = trainingBackend === 'xgboost_builtin' ? 'train' : 'training';

    const hyperParameters: Record<string, string> = {};
    if (trainingBackend === 'xgboost_builtin') {
      hyperParameters.objective = process.env.XGBOOST_OBJECTIVE ?? 'reg:squarederror';
      hyperParameters.eval_metric = process.env.XGBOOST_EVAL_METRIC ?? 'rmse';
      hyperParameters.num_round = process.env.XGBOOST_NUM_ROUND ?? '220';
      hyperParameters.max_depth = process.env.XGBOOST_MAX_DEPTH ?? '6';
      hyperParameters.eta = process.env.XGBOOST_ETA ?? '0.1';
      hyperParameters.subsample = process.env.XGBOOST_SUBSAMPLE ?? '0.85';
      hyperParameters.colsample_bytree = process.env.XGBOOST_COLSAMPLE_BYTREE ?? '0.85';
    } else {
      hyperParameters.model_version_id = modelVersionId;
      hyperParameters.training_domain = 'premium_quality';
    }

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
            ChannelName: channelName,
            DataSource: {
              S3DataSource: {
                S3DataType: 'S3Prefix',
                S3Uri: exportResult.s3PrefixUri,
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
        HyperParameters: hyperParameters,
        Tags: [
          { Key: 'Project', Value: 'CropCopilot' },
          { Key: 'ModelVersionId', Value: modelVersionId },
          { Key: 'ModelType', Value: 'premium_quality' },
          { Key: 'TrainingBackend', Value: trainingBackend },
        ],
      })
    );

    await db.query(
      `UPDATE "MLModelVersion" SET "s3Uri" = $1, "updatedAt" = NOW() WHERE id = $2`,
      [`${s3OutputPath}output/model.tar.gz`, modelVersionId]
    );

    await recordPipelineEvent(db, {
      pipeline: 'learning',
      stage: 'premium_retrain_submit',
      severity: 'info',
      message: `Submitted premium training job ${jobName}.`,
      metadata: {
        modelType: 'premium_quality',
        jobName,
        modelVersionId,
        samples: newFeedbackCount,
        trainingRows: exportResult.rowCount,
        trainingBackend,
      },
    });
  } catch (error) {
    const message = (error as Error).message;
    const isQuotaBlocked =
      (error as { name?: string }).name === 'ResourceLimitExceeded' ||
      /resource.?limit.?exceeded/i.test(message) ||
      /training job usage/i.test(message);

    if (isQuotaBlocked) {
      await db.query(
        `UPDATE "MLModelVersion" SET status = 'retired', "updatedAt" = NOW() WHERE id = $1`,
        [modelVersionId]
      );
      await recordPipelineEvent(db, {
        pipeline: 'learning',
        stage: 'premium_retrain_submit',
        severity: 'warn',
        message:
          'Premium retrain skipped because SageMaker training quota is unavailable in this account/region.',
        metadata: {
          modelType: 'premium_quality',
          modelVersionId,
          reason: message,
        },
      });
      return;
    }

    await db.query(
      `UPDATE "MLModelVersion" SET status = 'retired', "updatedAt" = NOW() WHERE id = $1`,
      [modelVersionId]
    );
    await recordPipelineEvent(db, {
      pipeline: 'learning',
      stage: 'premium_retrain_submit',
      severity: 'error',
      message: `Premium retrain failed: ${message}`,
      metadata: {
        modelType: 'premium_quality',
        modelVersionId,
      },
    });
    throw error;
  }
};
