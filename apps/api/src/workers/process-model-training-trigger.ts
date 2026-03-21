import type { SQSBatchItemFailure, SQSEvent, SQSHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { ModelTrainingTriggerRequestedSchema } from '@crop-copilot/contracts';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { recordPipelineEvent } from '../lib/pipeline-events';
import { handler as runLambdarankRetrain } from '../ml/training/retrain-trigger';
import { handler as runPremiumRetrain } from '../ml/training/retrain-premium-trigger';

interface TrainingTriggerRow {
  id: string;
  model_type: 'lambdarank' | 'premium_quality';
}

interface PgErrorLike {
  code?: string;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    pool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: Number(process.env.PG_POOL_MAX ?? 3),
      ssl: resolvePoolSslConfig(),
    });
  }
  return pool;
}

function isMissingTableError(error: unknown): boolean {
  const code = (error as PgErrorLike | null)?.code;
  return code === '42P01' || code === '42703';
}

async function claimTrigger(
  db: Pool,
  triggerId: string | undefined
): Promise<TrainingTriggerRow | null> {
  if (!triggerId) {
    return null;
  }

  try {
    const result = await db.query<TrainingTriggerRow>(
      `
        UPDATE "ModelTrainingTrigger"
        SET status = 'processing', "updatedAt" = NOW()
        WHERE id = $1
          AND status IN ('pending', 'skipped')
        RETURNING id, "modelType" AS model_type
      `,
      [triggerId]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
}

async function markTrigger(
  db: Pool,
  triggerId: string | undefined,
  status: 'completed' | 'failed' | 'skipped',
  reason?: string
): Promise<void> {
  if (!triggerId) return;
  try {
    await db.query(
      `
        UPDATE "ModelTrainingTrigger"
        SET
          status = $2,
          reason = $3,
          "errorMessage" = CASE WHEN $2 = 'failed' THEN $3 ELSE NULL END,
          "processedAt" = NOW(),
          "updatedAt" = NOW()
        WHERE id = $1
      `,
      [triggerId, status, reason ?? null]
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      return;
    }
    throw error;
  }
}

async function runRetrain(
  modelType: 'lambdarank' | 'premium_quality',
  force: boolean
): Promise<void> {
  if (modelType === 'premium_quality') {
    await runPremiumRetrain({
      id: '',
      version: '',
      account: '',
      region: process.env.AWS_REGION ?? 'us-east-1',
      detail: { force },
      source: 'crop-copilot.feedback',
      'detail-type': 'crop-copilot.ml.premium-retrain.scheduled',
      time: new Date().toISOString(),
      resources: [],
    } as any, {} as any, () => undefined);
    return;
  }

  await runLambdarankRetrain({
    id: '',
    version: '',
    account: '',
    region: process.env.AWS_REGION ?? 'us-east-1',
    detail: { force },
    source: 'crop-copilot.feedback',
    'detail-type': 'crop-copilot.ml.retrain.scheduled',
    time: new Date().toISOString(),
    resources: [],
  } as any, {} as any, () => undefined);
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  const db = getPool();
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const payload = ModelTrainingTriggerRequestedSchema.parse(JSON.parse(record.body));
      const claimed = await claimTrigger(db, payload.triggerId);
      const modelType = claimed?.model_type ?? payload.modelType;

      await runRetrain(modelType, payload.force ?? false);

      await markTrigger(db, payload.triggerId, 'completed');
      await recordPipelineEvent(db, {
        pipeline: 'learning',
        stage: 'feedback_trigger',
        severity: 'info',
        message: `Processed feedback-triggered retrain check for ${modelType}.`,
        recommendationId: payload.recommendationId ?? null,
        userId: payload.userId ?? null,
        metadata: {
          modelType,
          triggerId: payload.triggerId ?? null,
          feedbackId: payload.feedbackId ?? null,
          source: payload.source ?? null,
          force: payload.force ?? false,
        },
      });
    } catch (error) {
      const message = (error as Error).message;
      const parsedTriggerId = (() => {
        try {
          const body = JSON.parse(record.body) as { triggerId?: string };
          return body.triggerId;
        } catch {
          return undefined;
        }
      })();

      try {
        await markTrigger(db, parsedTriggerId, 'failed', message);
      } catch {
        // best effort
      }

      await recordPipelineEvent(db, {
        pipeline: 'learning',
        stage: 'feedback_trigger',
        severity: 'error',
        message: `Feedback-triggered retrain check failed: ${message}`,
        metadata: {
          messageId: record.messageId,
          triggerId: parsedTriggerId ?? null,
        },
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
