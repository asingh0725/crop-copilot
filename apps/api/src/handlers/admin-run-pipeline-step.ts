import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyHandlerV2, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import type { Pool } from 'pg';
import type {
  ComplianceIngestionBatchMessage,
  IngestionBatchMessage,
} from '@crop-copilot/contracts';
import { z } from 'zod';
import { withAuth } from '../auth/with-auth';
import type { AuthVerifier } from '../auth/types';
import { jsonResponse, parseJsonBody, isBadRequestError } from '../lib/http';
import { getRuntimePool } from '../lib/runtime-pool';
import { handler as discoverSourcesWorker } from '../workers/discover-sources';
import { handler as discoverComplianceSourcesWorker } from '../workers/discover-compliance-sources';
import { buildRunIngestionBatchHandler } from '../workers/run-ingestion-batch';
import { buildRunComplianceIngestionBatchHandler } from '../workers/run-compliance-ingestion-batch';
import { handler as processIngestionBatchWorker } from '../workers/process-ingestion-batch';
import { handler as processComplianceIngestionBatchWorker } from '../workers/process-compliance-ingestion-batch';
import type { IngestionQueue } from '../queue/ingestion-queue';
import type { ComplianceIngestionQueue } from '../queue/compliance-ingestion-queue';

const AdminRunPipelineStepSchema = z.object({
  pipeline: z.enum(['discovery', 'compliance']),
  step: z.enum([
    'discover_sources',
    'orchestrate_ingestion',
    'process_ingestion_inline',
  ]),
  maxSources: z.number().int().min(1).max(250).optional(),
  maxBatches: z.number().int().min(1).max(25).optional(),
  forceInline: z.boolean().optional(),
});

interface ExecutionSummary {
  pipeline: 'discovery' | 'compliance';
  step: 'discover_sources' | 'orchestrate_ingestion' | 'process_ingestion_inline';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  queueConfigured: boolean;
  inlineProcessing: boolean;
  orchestratedMessages: number;
  queuedSources: number;
  inlineProcessedMessages: number;
  inlineFailedMessages: number;
  notes: string[];
}

interface PipelineSnapshot {
  discovery: {
    pending: number;
    running: number;
    completed: number;
    error: number;
  };
  sources: {
    pending: number;
    running: number;
    readyOrIndexed: number;
    error: number;
    total: number;
    chunks: number;
    facts?: number;
  };
}

interface CountRow {
  pending: string;
  running: string;
  completed: string;
  error: string;
}

interface SourceCountRow {
  pending: string;
  running: string;
  ready_or_indexed: string;
  error: string;
  total: string;
  chunks: string;
  facts?: string;
}

interface PgErrorLike {
  code?: string;
}

class CapturingIngestionQueue implements IngestionQueue {
  public readonly messages: IngestionBatchMessage[] = [];

  async publishIngestionBatch(message: IngestionBatchMessage): Promise<void> {
    this.messages.push(message);
  }
}

class CapturingComplianceIngestionQueue implements ComplianceIngestionQueue {
  public readonly messages: ComplianceIngestionBatchMessage[] = [];

  async publishComplianceIngestionBatch(
    message: ComplianceIngestionBatchMessage
  ): Promise<void> {
    this.messages.push(message);
  }
}

function parseCsvList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAdmin(auth: { userId: string; email?: string }): boolean {
  const adminUserIds = parseCsvList(process.env.ADMIN_USER_IDS);
  const adminEmails = parseCsvList(process.env.ADMIN_EMAILS);

  if (adminUserIds.length === 0 && adminEmails.length === 0) {
    return true;
  }

  return (
    adminUserIds.includes(auth.userId) || (auth.email ? adminEmails.includes(auth.email) : false)
  );
}

function isMissingTableError(error: unknown): boolean {
  const code = (error as PgErrorLike | null)?.code;
  return code === '42P01' || code === '42703';
}

function toCount(value: string | null | undefined): number {
  return Number(value ?? 0);
}

async function readDiscoverySnapshot(db: Pool): Promise<PipelineSnapshot | null> {
  try {
    const [discoveryResult, sourceResult] = await Promise.all([
      db.query<CountRow>(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
          COUNT(*) FILTER (WHERE status = 'running')::text AS running,
          COUNT(*) FILTER (WHERE status = 'completed')::text AS completed,
          COUNT(*) FILTER (WHERE status = 'error')::text AS error
        FROM "CropRegionDiscovery"
      `),
      db.query<SourceCountRow>(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
          COUNT(*) FILTER (WHERE status = 'processing')::text AS running,
          COUNT(*) FILTER (WHERE status = 'ready')::text AS ready_or_indexed,
          COUNT(*) FILTER (WHERE status = 'error')::text AS error,
          COUNT(*)::text AS total,
          COALESCE(SUM("chunksCount"), 0)::text AS chunks
        FROM "Source"
      `),
    ]);

    const discovery = discoveryResult.rows[0];
    const sources = sourceResult.rows[0];
    return {
      discovery: {
        pending: toCount(discovery?.pending),
        running: toCount(discovery?.running),
        completed: toCount(discovery?.completed),
        error: toCount(discovery?.error),
      },
      sources: {
        pending: toCount(sources?.pending),
        running: toCount(sources?.running),
        readyOrIndexed: toCount(sources?.ready_or_indexed),
        error: toCount(sources?.error),
        total: toCount(sources?.total),
        chunks: toCount(sources?.chunks),
      },
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
}

async function readComplianceSnapshot(db: Pool): Promise<PipelineSnapshot | null> {
  try {
    const [discoveryResult, sourceResult] = await Promise.all([
      db.query<CountRow>(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
          COUNT(*) FILTER (WHERE status = 'running')::text AS running,
          COUNT(*) FILTER (WHERE status = 'completed')::text AS completed,
          COUNT(*) FILTER (WHERE status = 'error')::text AS error
        FROM "ComplianceDiscoveryQueue"
      `),
      db.query<SourceCountRow>(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
          COUNT(*) FILTER (WHERE status = 'running')::text AS running,
          COUNT(*) FILTER (WHERE status = 'indexed')::text AS ready_or_indexed,
          COUNT(*) FILTER (WHERE status = 'error')::text AS error,
          COUNT(*)::text AS total,
          COALESCE(SUM("chunksCount"), 0)::text AS chunks,
          COALESCE(SUM("factsCount"), 0)::text AS facts
        FROM "ComplianceSource"
      `),
    ]);

    const discovery = discoveryResult.rows[0];
    const sources = sourceResult.rows[0];
    return {
      discovery: {
        pending: toCount(discovery?.pending),
        running: toCount(discovery?.running),
        completed: toCount(discovery?.completed),
        error: toCount(discovery?.error),
      },
      sources: {
        pending: toCount(sources?.pending),
        running: toCount(sources?.running),
        readyOrIndexed: toCount(sources?.ready_or_indexed),
        error: toCount(sources?.error),
        total: toCount(sources?.total),
        chunks: toCount(sources?.chunks),
        facts: toCount(sources?.facts),
      },
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
}

function toSingleRecordSqsEvent(body: string): SQSEvent {
  const nowMs = Date.now();
  return {
    Records: [
      {
        messageId: randomUUID(),
        receiptHandle: 'manual-receipt',
        body,
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: String(nowMs),
          SenderId: 'admin-manual-run',
          ApproximateFirstReceiveTimestamp: String(nowMs),
        },
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:manual:manual-run',
        awsRegion: process.env.AWS_REGION ?? process.env.COGNITO_REGION ?? 'ca-west-1',
      },
    ],
  };
}

function countBatchFailures(result: void | SQSBatchResponse): number {
  return result?.batchItemFailures?.length ?? 0;
}

async function runDiscoveryStep(
  payload: z.infer<typeof AdminRunPipelineStepSchema>,
  summary: ExecutionSummary
): Promise<void> {
  if (payload.step === 'discover_sources') {
    const maxBatches = payload.maxBatches ?? 1;
    await discoverSourcesWorker(
      {
        detail: {
          trigger: 'manual',
          maxBatches,
        },
      } as never,
      {} as never,
      () => undefined
    );
    summary.notes.push(`Discovery source scan executed with maxBatches=${maxBatches}.`);
    return;
  }

  const queueConfigured = Boolean(process.env.SQS_INGESTION_QUEUE_URL);
  const inlineProcessing =
    payload.step === 'process_ingestion_inline' || payload.forceInline === true || !queueConfigured;

  summary.queueConfigured = queueConfigured;
  summary.inlineProcessing = inlineProcessing;

  const maxSources = payload.maxSources ?? 50;

  if (!inlineProcessing) {
    const runHandler = buildRunIngestionBatchHandler();
    await runHandler(
      {
        detail: {
          trigger: 'manual',
          maxSources,
        },
      } as never,
      {} as never,
      () => undefined
    );
    summary.notes.push(
      `Discovery ingestion orchestration queued via SQS with maxSources=${maxSources}.`
    );
    return;
  }

  const queue = new CapturingIngestionQueue();
  const runHandler = buildRunIngestionBatchHandler(queue);
  await runHandler(
    {
      detail: {
        trigger: 'manual',
        maxSources,
      },
    } as never,
    {} as never,
    () => undefined
  );

  summary.orchestratedMessages = queue.messages.length;
  summary.queuedSources = queue.messages.reduce((acc, message) => acc + message.sources.length, 0);

  for (const message of queue.messages) {
    const result = await processIngestionBatchWorker(
      toSingleRecordSqsEvent(JSON.stringify(message)),
      {} as never,
      () => undefined
    );
    const failures = countBatchFailures(result);
    summary.inlineFailedMessages += failures;
  }

  summary.inlineProcessedMessages =
    summary.orchestratedMessages - summary.inlineFailedMessages;
  summary.notes.push(
    `Discovery ingestion processed inline (${summary.inlineProcessedMessages}/${summary.orchestratedMessages} messages).`
  );
}

async function runComplianceStep(
  payload: z.infer<typeof AdminRunPipelineStepSchema>,
  summary: ExecutionSummary
): Promise<void> {
  if (payload.step === 'discover_sources') {
    const batchSize = payload.maxSources ?? 25;
    await discoverComplianceSourcesWorker(
      {
        detail: {
          trigger: 'manual',
          batchSize,
        },
      } as never,
      {} as never,
      () => undefined
    );
    summary.notes.push(`Compliance source scan executed with batchSize=${batchSize}.`);
    return;
  }

  const queueConfigured = Boolean(process.env.SQS_COMPLIANCE_INGESTION_QUEUE_URL);
  const inlineProcessing =
    payload.step === 'process_ingestion_inline' || payload.forceInline === true || !queueConfigured;

  summary.queueConfigured = queueConfigured;
  summary.inlineProcessing = inlineProcessing;

  const maxSources = payload.maxSources ?? 50;

  if (!inlineProcessing) {
    const runHandler = buildRunComplianceIngestionBatchHandler();
    await runHandler(
      {
        detail: {
          trigger: 'manual',
          maxSources,
        },
      } as never,
      {} as never,
      () => undefined
    );
    summary.notes.push(
      `Compliance ingestion orchestration queued via SQS with maxSources=${maxSources}.`
    );
    return;
  }

  const queue = new CapturingComplianceIngestionQueue();
  const runHandler = buildRunComplianceIngestionBatchHandler(queue);
  await runHandler(
    {
      detail: {
        trigger: 'manual',
        maxSources,
      },
    } as never,
    {} as never,
    () => undefined
  );

  summary.orchestratedMessages = queue.messages.length;
  summary.queuedSources = queue.messages.reduce((acc, message) => acc + message.sources.length, 0);

  for (const message of queue.messages) {
    const result = await processComplianceIngestionBatchWorker(
      toSingleRecordSqsEvent(JSON.stringify(message)),
      {} as never,
      () => undefined
    );
    const failures = countBatchFailures(result);
    summary.inlineFailedMessages += failures;
  }

  summary.inlineProcessedMessages =
    summary.orchestratedMessages - summary.inlineFailedMessages;
  summary.notes.push(
    `Compliance ingestion processed inline (${summary.inlineProcessedMessages}/${summary.orchestratedMessages} messages).`
  );
}

export function buildAdminRunPipelineStepHandler(
  verifier?: AuthVerifier
): APIGatewayProxyHandlerV2 {
  return withAuth(async (event, auth) => {
    if (!isAdmin(auth)) {
      return jsonResponse(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
          },
        },
        { statusCode: 403 }
      );
    }

    let payload: z.infer<typeof AdminRunPipelineStepSchema>;
    try {
      payload = AdminRunPipelineStepSchema.parse(parseJsonBody<unknown>(event.body));
    } catch (error) {
      if (error instanceof z.ZodError || isBadRequestError(error)) {
        return jsonResponse(
          {
            error: {
              code: 'BAD_REQUEST',
              message: error instanceof Error ? error.message : 'Invalid request payload',
            },
          },
          { statusCode: 400 }
        );
      }

      return jsonResponse(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Invalid request payload',
          },
        },
        { statusCode: 400 }
      );
    }

    const startedAt = new Date();
    const db = getRuntimePool();
    const beforeSnapshot =
      payload.pipeline === 'discovery'
        ? await readDiscoverySnapshot(db)
        : await readComplianceSnapshot(db);

    const summary: ExecutionSummary = {
      pipeline: payload.pipeline,
      step: payload.step,
      startedAt: startedAt.toISOString(),
      completedAt: startedAt.toISOString(),
      durationMs: 0,
      queueConfigured:
        payload.pipeline === 'discovery'
          ? Boolean(process.env.SQS_INGESTION_QUEUE_URL)
          : Boolean(process.env.SQS_COMPLIANCE_INGESTION_QUEUE_URL),
      inlineProcessing: false,
      orchestratedMessages: 0,
      queuedSources: 0,
      inlineProcessedMessages: 0,
      inlineFailedMessages: 0,
      notes: [],
    };

    try {
      if (payload.pipeline === 'discovery') {
        await runDiscoveryStep(payload, summary);
      } else {
        await runComplianceStep(payload, summary);
      }

      const completedAt = new Date();
      summary.completedAt = completedAt.toISOString();
      summary.durationMs = completedAt.getTime() - startedAt.getTime();

      const afterSnapshot =
        payload.pipeline === 'discovery'
          ? await readDiscoverySnapshot(db)
          : await readComplianceSnapshot(db);

      return jsonResponse(
        {
          success: true,
          execution: summary,
          snapshotBefore: beforeSnapshot,
          snapshotAfter: afterSnapshot,
        },
        { statusCode: 200 }
      );
    } catch (error) {
      console.error('Failed to run admin pipeline step', {
        pipeline: payload.pipeline,
        step: payload.step,
        error: (error as Error).message,
      });

      return jsonResponse(
        {
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: (error as Error).message || 'Failed to run pipeline step',
          },
        },
        { statusCode: 500 }
      );
    }
  }, verifier);
}

export const handler = buildAdminRunPipelineStepHandler();
