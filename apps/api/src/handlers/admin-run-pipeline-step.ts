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

const PipelineStepValues = [
  'discover_sources',
  'orchestrate_ingestion',
  'process_ingestion_inline',
  'ingest_source_url',
  'force_reingest_all',
  'seed_demo_data',
] as const;

type PipelineStep = (typeof PipelineStepValues)[number];

const AdminRunPipelineStepSchema = z
  .object({
    pipeline: z.enum(['discovery', 'compliance']),
    step: z.enum(PipelineStepValues),
    maxSources: z.number().int().min(1).max(250).optional(),
    maxBatches: z.number().int().min(1).max(25).optional(),
    forceInline: z.boolean().optional(),
    sourceUrl: z.string().url().max(2000).optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.step === 'ingest_source_url' && payload.pipeline !== 'compliance') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pipeline'],
        message: 'ingest_source_url is only supported for the compliance pipeline',
      });
    }

    if (payload.step === 'ingest_source_url' && !payload.sourceUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceUrl'],
        message: 'sourceUrl is required when step=ingest_source_url',
      });
    }
  });

interface ExecutionSummary {
  pipeline: 'discovery' | 'compliance';
  step: PipelineStep;
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

interface CountOnlyRow {
  count: string;
}

interface ComplianceSourceDescriptorRow {
  id: string;
  url: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  freshness_hours: number;
  jurisdiction: string;
  state: string | null;
  crop: string | null;
  tags: unknown;
}

interface ComplianceSourceStatusRow {
  status: string;
  chunks_count: number;
  facts_count: number;
  error_message: string | null;
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

function parseComplianceTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((value): value is string => typeof value === 'string');
}

function inferComplianceSourceTypeFromUrl(sourceUrl: string): string {
  const normalized = sourceUrl.toLowerCase();
  if (normalized.includes('.gov')) {
    return 'government';
  }
  if (normalized.includes('.edu') || normalized.includes('extension')) {
    return 'university_extension';
  }
  return 'regulatory';
}

function toTitleCaseWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2) {
        return word.toUpperCase();
      }
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(' ');
}

function deriveComplianceSourceTitle(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const hostname = parsed.hostname.replace(/^www\./i, '');
    const segments = parsed.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const lastSegment = segments[segments.length - 1] ?? '';
    const readableSegment = decodeURIComponent(lastSegment)
      .replace(/\.[a-z0-9]{2,6}$/i, '')
      .replace(/[-_+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (readableSegment.length > 0) {
      return `${hostname} - ${toTitleCaseWords(readableSegment)}`.slice(0, 220);
    }
    return hostname.slice(0, 220);
  } catch {
    return sourceUrl.slice(0, 220);
  }
}

async function upsertManualComplianceSource(
  db: Pool,
  sourceUrl: string
): Promise<ComplianceSourceDescriptorRow> {
  const sourceType = inferComplianceSourceTypeFromUrl(sourceUrl);
  const title = deriveComplianceSourceTitle(sourceUrl);
  const defaultTags = JSON.stringify(['compliance', 'manual-url']);

  const result = await db.query<ComplianceSourceDescriptorRow>(
    `
      INSERT INTO "ComplianceSource" (
        url,
        title,
        "sourceType",
        jurisdiction,
        status,
        priority,
        "freshnessHours",
        tags,
        "errorMessage",
        "createdAt",
        "updatedAt"
      )
      VALUES ($1, $2, $3, 'US', 'pending', 'high', 12, $4::jsonb, NULL, NOW(), NOW())
      ON CONFLICT (url)
      DO UPDATE SET
        title = EXCLUDED.title,
        "sourceType" = EXCLUDED."sourceType",
        status = 'pending',
        priority = 'high',
        "freshnessHours" = EXCLUDED."freshnessHours",
        "errorMessage" = NULL,
        "updatedAt" = NOW()
      RETURNING
        id,
        url,
        title,
        priority,
        "freshnessHours" AS freshness_hours,
        jurisdiction,
        state,
        crop,
        tags
    `,
    [sourceUrl, title, sourceType, defaultTags]
  );

  const source = result.rows[0];
  if (!source) {
    throw new Error('Failed to upsert compliance source URL');
  }
  return source;
}

async function insertManualComplianceRun(
  db: Pool,
  source: ComplianceSourceDescriptorRow
): Promise<string> {
  const runId = randomUUID();
  await db.query(
    `
      INSERT INTO "ComplianceIngestionRun" (
        id,
        trigger,
        status,
        "sourcesQueued",
        "startedAt",
        metadata,
        "createdAt"
      )
      VALUES ($1, 'manual', 'running', 1, NOW(), $2::jsonb, NOW())
    `,
    [runId, JSON.stringify({ sourceId: source.id, sourceUrl: source.url, sourceTitle: source.title })]
  );
  return runId;
}

async function readComplianceSourceStatus(
  db: Pool,
  sourceId: string
): Promise<ComplianceSourceStatusRow | null> {
  const result = await db.query<ComplianceSourceStatusRow>(
    `
      SELECT
        status,
        "chunksCount" AS chunks_count,
        "factsCount" AS facts_count,
        "errorMessage" AS error_message
      FROM "ComplianceSource"
      WHERE id = $1
      LIMIT 1
    `,
    [sourceId]
  );

  return result.rows[0] ?? null;
}

async function runManualComplianceSourceIngestion(
  payload: z.infer<typeof AdminRunPipelineStepSchema>,
  summary: ExecutionSummary
): Promise<void> {
  const sourceUrl = payload.sourceUrl?.trim();
  if (!sourceUrl) {
    throw new Error('sourceUrl is required when step=ingest_source_url');
  }

  const db = getRuntimePool();
  const source = await upsertManualComplianceSource(db, sourceUrl);
  const runId = await insertManualComplianceRun(db, source);

  const message: ComplianceIngestionBatchMessage = {
    messageType: 'compliance.ingestion.batch.requested',
    messageVersion: '1',
    requestedAt: new Date().toISOString(),
    runId,
    sources: [
      {
        sourceId: source.id,
        url: source.url,
        priority: source.priority,
        freshnessHours: source.freshness_hours,
        jurisdiction: source.jurisdiction,
        state: source.state,
        crop: source.crop,
        tags: parseComplianceTags(source.tags),
      },
    ],
  };

  summary.queueConfigured = Boolean(process.env.SQS_COMPLIANCE_INGESTION_QUEUE_URL);
  summary.inlineProcessing = true;
  summary.orchestratedMessages = 1;
  summary.queuedSources = 1;

  const processResult = await processComplianceIngestionBatchWorker(
    toSingleRecordSqsEvent(JSON.stringify(message)),
    {} as never,
    () => undefined
  );
  const failures = countBatchFailures(processResult);
  summary.inlineFailedMessages = failures;
  summary.inlineProcessedMessages = summary.orchestratedMessages - failures;

  if (failures > 0) {
    throw new Error(`Failed to process compliance URL ${source.url}`);
  }

  const latest = await readComplianceSourceStatus(db, source.id);
  if (!latest) {
    summary.notes.push(`Manual URL ingested: ${source.url}.`);
    return;
  }

  if (latest.status === 'error') {
    throw new Error(
      latest.error_message
        ? `Ingestion failed for ${source.url}: ${latest.error_message}`
        : `Ingestion failed for ${source.url}`
    );
  }

  summary.notes.push(
    `Manual URL ingested: ${source.url} (${latest.status}, ${latest.chunks_count} chunks, ${latest.facts_count} facts).`
  );
}

async function runDiscoveryStep(
  payload: z.infer<typeof AdminRunPipelineStepSchema>,
  summary: ExecutionSummary,
  userId: string
): Promise<void> {
  if (payload.step === 'seed_demo_data') {
    const seeded = await seedLocalDemoData(getRuntimePool(), userId);
    summary.notes.push(
      `Seeded demo app data for user ${userId}: ${seeded.inputs} inputs, ${seeded.recommendations} recommendations, ${seeded.products} products, ${seeded.productLinks} product links.`
    );
    return;
  }

  if (payload.step === 'force_reingest_all') {
    throw new Error('force_reingest_all is only supported for the compliance pipeline');
  }

  if (payload.step === 'ingest_source_url') {
    throw new Error('ingest_source_url is only supported for the compliance pipeline');
  }

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

async function resetAllComplianceSources(db: Pool): Promise<number> {
  const result = await db.query(
    `
      UPDATE "ComplianceSource"
      SET
        status = 'pending',
        "errorMessage" = NULL,
        "lastFetchedAt" = NULL,
        "lastIndexedAt" = NULL,
        "chunksCount" = 0,
        "factsCount" = 0,
        "updatedAt" = NOW()
      WHERE status IN ('pending', 'error', 'indexed')
    `
  );

  return result.rowCount ?? 0;
}

async function runComplianceIngestion(
  payload: z.infer<typeof AdminRunPipelineStepSchema>,
  summary: ExecutionSummary
): Promise<void> {
  const queueConfigured = Boolean(process.env.SQS_COMPLIANCE_INGESTION_QUEUE_URL);
  const inlineProcessing =
    payload.step === 'process_ingestion_inline' || payload.forceInline === true || !queueConfigured;

  summary.queueConfigured = queueConfigured;
  summary.inlineProcessing = inlineProcessing;

  const maxSources =
    payload.maxSources ?? (payload.step === 'force_reingest_all' ? 250 : 50);

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

async function runComplianceStep(
  payload: z.infer<typeof AdminRunPipelineStepSchema>,
  summary: ExecutionSummary
): Promise<void> {
  if (payload.step === 'seed_demo_data') {
    throw new Error('seed_demo_data is only supported for the discovery pipeline');
  }

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

  if (payload.step === 'ingest_source_url') {
    await runManualComplianceSourceIngestion(payload, summary);
    return;
  }

  if (payload.step === 'force_reingest_all') {
    const resetCount = await resetAllComplianceSources(getRuntimePool());
    summary.notes.push(
      `Force reset complete: ${resetCount} compliance sources marked pending for full re-ingestion.`
    );
  }

  await runComplianceIngestion(payload, summary);
}

async function seedLocalDemoData(
  db: Pool,
  userId: string
): Promise<{ inputs: number; recommendations: number; products: number; productLinks: number }> {
  const fallbackEmail = `local-seed-${userId.slice(0, 8)}@cropcopilot.local`;
  await db.query(
    `
      INSERT INTO "User" (id, email, "createdAt", "updatedAt")
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE
        SET
          email = EXCLUDED.email,
          "updatedAt" = NOW()
    `,
    [userId, fallbackEmail]
  );

  const existingProfile = await db.query<{ id: string }>(
    `SELECT id FROM "UserProfile" WHERE "userId" = $1 LIMIT 1`,
    [userId]
  );
  if (!existingProfile.rows[0]?.id) {
    await db.query(
      `
        INSERT INTO "UserProfile" (
          id,
          "userId",
          location,
          "farmSize",
          "cropsOfInterest",
          "experienceLevel",
          "createdAt",
          "updatedAt"
        )
        VALUES ($1, $2, 'Local test farm', '120 acres', ARRAY['corn','soybeans'], 'intermediate', NOW(), NOW())
      `,
      [randomUUID(), userId]
    );
  }

  const demoProducts = [
    {
      id: '10000000-0000-4000-8000-000000000101',
      name: 'Copper Shield 5E',
      type: 'FUNGICIDE',
      description: 'Contact fungicide for early blight and bacterial leaf spot pressure.',
      applicationRate: '1.5 pt/acre',
      crops: ['tomatoes', 'peppers'],
    },
    {
      id: '10000000-0000-4000-8000-000000000102',
      name: 'RootBoost 12-48-8',
      type: 'FERTILIZER',
      description: 'Starter fertility blend for transplant establishment and root vigor.',
      applicationRate: '6 gal/acre',
      crops: ['tomatoes', 'cucumbers'],
    },
    {
      id: '10000000-0000-4000-8000-000000000103',
      name: 'AphidGuard Bio',
      type: 'INSECTICIDE',
      description: 'Soft-contact biological control option for aphid suppression.',
      applicationRate: '18 oz/acre',
      crops: ['soybeans', 'peppers'],
    },
  ] as const;

  for (const product of demoProducts) {
    await db.query(
      `
        INSERT INTO "Product" (
          id,
          name,
          type,
          analysis,
          "applicationRate",
          crops,
          description,
          metadata,
          "createdAt",
          "updatedAt"
        )
        VALUES (
          $1,
          $2,
          $3::"ProductType",
          '{}'::jsonb,
          $4,
          $5::text[],
          $6,
          '{"seeded": true}'::jsonb,
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO UPDATE
          SET
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            "applicationRate" = EXCLUDED."applicationRate",
            crops = EXCLUDED.crops,
            description = EXCLUDED.description,
            metadata = EXCLUDED.metadata,
            "updatedAt" = NOW()
      `,
      [
        product.id,
        product.name,
        product.type,
        product.applicationRate,
        product.crops,
        product.description,
      ]
    );
  }

  interface DemoCitationSource {
    sourceId: string;
    chunkId: string;
    title: string;
    sourceType: 'GOVERNMENT' | 'UNIVERSITY_EXTENSION' | 'RESEARCH_PAPER';
    url: string;
    publisher: string;
    excerpt: string;
    relevanceScore: number;
  }

  interface DemoRecord {
    inputId: string;
    recommendationId: string;
    inputType: 'PHOTO' | 'LAB_REPORT';
    crop: string;
    location: string;
    season: string;
    imageUrl: string;
    description: string;
    confidence: number;
    diagnosis: Record<string, unknown>;
    linkedProducts: string[];
    citationSources: DemoCitationSource[];
  }

  const demoRecords: DemoRecord[] = [
    {
      inputId: randomUUID(),
      recommendationId: randomUUID(),
      inputType: 'PHOTO',
      crop: 'tomatoes',
      location: 'Salinas, CA',
      season: 'spring',
      imageUrl: '/images/tomato-demo.png',
      description:
        'Lower leaves show yellow halo spots with some dark lesions after recent moisture.',
      confidence: 0.82,
      diagnosis: {
        diagnosis: {
          condition: 'Early blight pressure likely',
          conditionType: 'disease',
          reasoning:
            'Lesion shape, lower-canopy progression, and recent humidity pattern align with early blight pressure.',
        },
        recommendations: [
          {
            action: 'Start a labeled fungicide interval before the next wet period',
            priority: 'immediate',
            timing: 'Within 24 hours and before overhead irrigation/rainfall.',
            details:
              'Use a labeled product and rotate FRAC group on the next pass. Keep interval tight while leaf wetness remains elevated.',
            citations: ['demo-chunk-tomato-early-blight', 'demo-chunk-tomato-rotation'],
          },
          {
            action: 'Remove high-load lower foliage and improve canopy airflow',
            priority: 'soon',
            timing: 'During the next field pass (1 to 2 days).',
            details:
              'Prune heavily infected lower tissue and reduce prolonged leaf wetness in the lower canopy to slow spread.',
            citations: ['demo-chunk-tomato-early-blight'],
          },
          {
            action: 'Re-scout disease progression with fixed transects',
            priority: 'soon',
            timing: '48 to 72 hours after first treatment.',
            details:
              'Track lesion expansion and new symptom count in the same transects to confirm control efficacy and interval need.',
            citations: ['demo-chunk-tomato-scouting'],
          },
          {
            action: 'Document action and conditions in the application log',
            priority: 'when_convenient',
            timing: 'Same day as spray completion.',
            details:
              'Record product, rate, weather window, and observed pressure so follow-up recommendations can optimize timing and cost.',
            citations: ['demo-chunk-tomato-scouting'],
          },
        ],
        evidencePreview: [
          'Early blight lesions typically begin on older foliage and intensify under extended moisture.',
          'FRAC rotation and interval discipline are key to slowing disease progression.',
        ],
      },
      linkedProducts: [demoProducts[0]!.id, demoProducts[1]!.id],
      citationSources: [
        {
          sourceId: 'demo-source-tomato-early-blight',
          chunkId: 'demo-chunk-tomato-early-blight',
          title: 'UC IPM: Tomato Early Blight',
          sourceType: 'UNIVERSITY_EXTENSION',
          url: 'https://ipm.ucanr.edu/agriculture/tomato/early-blight/',
          publisher: 'UC IPM',
          excerpt:
            'Early blight pressure increases with prolonged leaf wetness; lower-canopy symptom development is a common early signal.',
          relevanceScore: 0.95,
        },
        {
          sourceId: 'demo-source-tomato-fungicide-rotation',
          chunkId: 'demo-chunk-tomato-rotation',
          title: 'Cornell CALS: Managing Early Blight in Tomato',
          sourceType: 'UNIVERSITY_EXTENSION',
          url: 'https://vegetablemdonline.ppath.cornell.edu/factsheets/Tomato_EarlyBlt.htm',
          publisher: 'Cornell CALS',
          excerpt:
            'Fungicide rotation and interval consistency are core components of early blight management under persistent humidity.',
          relevanceScore: 0.88,
        },
        {
          sourceId: 'demo-source-tomato-scouting',
          chunkId: 'demo-chunk-tomato-scouting',
          title: 'Purdue Extension: Vegetable Disease Scouting Practices',
          sourceType: 'UNIVERSITY_EXTENSION',
          url: 'https://extension.entm.purdue.edu/newsletters/pestandcrop/article/field-crop-disease-monitoring-resources-for-indiana-in-2025/',
          publisher: 'Purdue Extension',
          excerpt:
            'Structured scouting intervals and repeat transects improve confidence when evaluating treatment performance.',
          relevanceScore: 0.81,
        },
      ],
    },
    {
      inputId: randomUUID(),
      recommendationId: randomUUID(),
      inputType: 'PHOTO',
      crop: 'soybeans',
      location: 'Ames, IA',
      season: 'summer',
      imageUrl: '/images/soybean-hero.png',
      description:
        'Scattered stunting and stippling with visible aphids on the underside of leaves.',
      confidence: 0.76,
      diagnosis: {
        diagnosis: {
          condition: 'Soybean aphid activity detected',
          conditionType: 'pest',
          reasoning:
            'Observed aphid clustering, stippling, and field distribution pattern indicate active feeding pressure with expansion risk.',
        },
        recommendations: [
          {
            action: 'Run immediate threshold scouting across representative zones',
            priority: 'immediate',
            timing: 'Today, before any foliar intervention.',
            details:
              'Confirm per-plant aphid counts and field distribution so treatment is justified by threshold and not edge-only pressure.',
            citations: ['demo-chunk-soybean-threshold'],
          },
          {
            action: 'Treat blocks exceeding threshold with a labeled control option',
            priority: 'soon',
            timing: 'Within 24 to 48 hours where threshold is exceeded.',
            details:
              'Prioritize hot spots first and avoid unnecessary whole-field applications when pressure remains below threshold.',
            citations: ['demo-chunk-soybean-threshold', 'demo-chunk-soybean-ipm'],
          },
          {
            action: 'Schedule follow-up scouting after treatment',
            priority: 'soon',
            timing: '3 to 5 days post-application.',
            details:
              'Recheck representative plants to confirm population decline and watch for rebound under warm conditions.',
            citations: ['demo-chunk-soybean-ipm'],
          },
          {
            action: 'Log observations and treatment outcome for trend tracking',
            priority: 'when_convenient',
            timing: 'At the end of each scouting/treatment day.',
            details:
              'Capture pressure map, treatment decisions, and observed response so future recommendations can optimize timing.',
            citations: ['demo-chunk-soybean-recordkeeping'],
          },
        ],
        evidencePreview: [
          'Aphid threshold-based treatment helps prevent avoidable application cost and resistance pressure.',
          'Post-treatment scouting is required to verify response and identify rebound risk.',
        ],
      },
      linkedProducts: [demoProducts[2]!.id],
      citationSources: [
        {
          sourceId: 'demo-source-soybean-threshold',
          chunkId: 'demo-chunk-soybean-threshold',
          title: 'Iowa State Extension: Soybean Aphid Threshold Guidance',
          sourceType: 'UNIVERSITY_EXTENSION',
          url: 'https://crops.extension.iastate.edu/cropnews/2009/07/soybean-aphid-threshold-update',
          publisher: 'Iowa State Extension',
          excerpt:
            'Economic threshold scouting is essential before treatment decisions for soybean aphid to avoid unnecessary applications.',
          relevanceScore: 0.94,
        },
        {
          sourceId: 'demo-source-soybean-ipm',
          chunkId: 'demo-chunk-soybean-ipm',
          title: 'University of Minnesota Extension: Soybean Aphid Management',
          sourceType: 'UNIVERSITY_EXTENSION',
          url: 'https://extension.umn.edu/soybean-pest-management/soybean-aphid',
          publisher: 'University of Minnesota Extension',
          excerpt:
            'Follow-up scouting after treatment is needed to validate control and monitor for resurgence in favorable conditions.',
          relevanceScore: 0.86,
        },
        {
          sourceId: 'demo-source-soybean-recordkeeping',
          chunkId: 'demo-chunk-soybean-recordkeeping',
          title: 'Purdue Extension: Integrated Pest Monitoring Practices',
          sourceType: 'UNIVERSITY_EXTENSION',
          url: 'https://ag.purdue.edu/department/btny/extension/ppp/pest-crop/',
          publisher: 'Purdue Extension',
          excerpt:
            'Consistent scouting records improve intervention timing and increase confidence in future pest-management decisions.',
          relevanceScore: 0.79,
        },
      ],
    },
  ];

  const upsertDemoCitationSources = async (
    recommendationId: string,
    crop: string,
    citationSources: DemoCitationSource[]
  ): Promise<void> => {
    for (const [index, source] of citationSources.entries()) {
      await db.query(
        `
          INSERT INTO "Source" (
            id,
            title,
            url,
            "sourceType",
            institution,
            status,
            "chunksCount",
            priority,
            "freshnessHours",
            tags,
            "createdAt",
            "updatedAt"
          )
          VALUES (
            $1,
            $2,
            $3,
            $4::"SourceType",
            $5,
            'ready',
            1,
            'medium',
            168,
            $6::jsonb,
            NOW(),
            NOW()
          )
          ON CONFLICT (id) DO UPDATE
            SET
              title = EXCLUDED.title,
              url = EXCLUDED.url,
              "sourceType" = EXCLUDED."sourceType",
              institution = EXCLUDED.institution,
              status = 'ready',
              "chunksCount" = GREATEST("Source"."chunksCount", 1),
              tags = EXCLUDED.tags,
              "updatedAt" = NOW()
        `,
        [
          source.sourceId,
          source.title,
          source.url,
          source.sourceType,
          source.publisher,
          JSON.stringify(['demo-seeded', crop]),
        ]
      );

      await db.query(
        `
          INSERT INTO "TextChunk" (
            id,
            "sourceId",
            content,
            metadata,
            "chunkIndex",
            "createdAt"
          )
          VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
          ON CONFLICT (id) DO UPDATE
            SET
              "sourceId" = EXCLUDED."sourceId",
              content = EXCLUDED.content,
              metadata = EXCLUDED.metadata,
              "chunkIndex" = EXCLUDED."chunkIndex"
        `,
        [
          source.chunkId,
          source.sourceId,
          source.excerpt,
          JSON.stringify({
            seeded: true,
            kind: 'demo-citation',
            sourceUrl: source.url,
          }),
          index,
        ]
      );

      await db.query(
        `
          INSERT INTO "RecommendationSource" (
            id,
            "recommendationId",
            "textChunkId",
            "relevanceScore"
          )
          SELECT $1, $2, $3, $4
          WHERE NOT EXISTS (
            SELECT 1
            FROM "RecommendationSource"
            WHERE "recommendationId" = $2
              AND "textChunkId" = $3
          )
        `,
        [randomUUID(), recommendationId, source.chunkId, source.relevanceScore]
      );
    }
  };

  const existingRecommendationCount = await db.query<CountOnlyRow>(
    `SELECT COUNT(*)::text AS count FROM "Recommendation" WHERE "userId" = $1`,
    [userId]
  );
  if (Number(existingRecommendationCount.rows[0]?.count ?? 0) > 0) {
    const recs = await db.query<{
      id: string;
      input_id: string;
      model_used: string;
      input_description: string | null;
      source_count: string;
    }>(
      `
        SELECT
          r.id,
          r."inputId" AS input_id,
          r."modelUsed" AS model_used,
          i.description AS input_description,
          (
            SELECT COUNT(*)::text
            FROM "RecommendationSource" rs
            WHERE rs."recommendationId" = r.id
          ) AS source_count
        FROM "Recommendation" r
        JOIN "Input" i ON i.id = r."inputId"
        WHERE r."userId" = $1
        ORDER BY "createdAt" DESC
        LIMIT 2
      `,
      [userId]
    );

    let insertedLinks = 0;
    for (const [index, rec] of recs.rows.entries()) {
      const productId =
        index === 0 ? demoProducts[0]!.id : demoProducts[Math.min(index, demoProducts.length - 1)]!.id;
      const existingLink = await db.query<CountOnlyRow>(
        `SELECT COUNT(*)::text AS count FROM "ProductRecommendation" WHERE "recommendationId" = $1`,
        [rec.id]
      );
      if (Number(existingLink.rows[0]?.count ?? 0) > 0) {
        continue;
      }

      insertedLinks += 1;
      await db.query(
        `
          INSERT INTO "ProductRecommendation" (
            id,
            "recommendationId",
            "productId",
            reason,
            "applicationRate",
            priority,
            "searchTimestamp",
            "createdAt"
          )
          VALUES ($1, $2, $3, 'Demo seeded recommendation', NULL, 1, NOW(), NOW())
        `,
        [randomUUID(), rec.id, productId]
      );
    }

    let upgradedDemoRecommendations = 0;
    for (const [index, rec] of recs.rows.entries()) {
      const demoRecord = demoRecords[index];
      if (!demoRecord) {
        continue;
      }

      const matchesDemoSeed =
        rec.model_used === 'rag-v2-scaffold' && rec.input_description === demoRecord.description;
      if (!matchesDemoSeed) {
        continue;
      }

      await db.query(
        `
          UPDATE "Input"
          SET "imageUrl" = COALESCE("imageUrl", $2)
          WHERE id = $1
        `,
        [rec.input_id, demoRecord.imageUrl]
      );

      await db.query(
        `
          UPDATE "Recommendation"
          SET
            diagnosis = $2::jsonb,
            confidence = $3
          WHERE id = $1
        `,
        [rec.id, JSON.stringify(demoRecord.diagnosis), demoRecord.confidence]
      );

      if (Number(rec.source_count ?? 0) === 0) {
        await upsertDemoCitationSources(rec.id, demoRecord.crop, demoRecord.citationSources);
      }

      upgradedDemoRecommendations += 1;
    }

    return {
      inputs: 0,
      recommendations: 0,
      products: demoProducts.length,
      productLinks: insertedLinks + upgradedDemoRecommendations,
    };
  }

  for (const record of demoRecords) {
    await db.query(
      `
        INSERT INTO "Input" (
          id,
          "userId",
          type,
          "imageUrl",
          description,
          location,
          crop,
          season,
          "fieldAcreage",
          "plannedApplicationDate",
          "fieldLatitude",
          "fieldLongitude",
          "createdAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 40, CURRENT_DATE + INTERVAL '2 days', 36.67, -121.65, NOW())
        ON CONFLICT (id) DO NOTHING
      `,
      [
        record.inputId,
        userId,
        record.inputType,
        record.imageUrl,
        record.description,
        record.location,
        record.crop,
        record.season,
      ]
    );

    await db.query(
      `
        INSERT INTO "Recommendation" (
          id,
          "userId",
          "inputId",
          diagnosis,
          confidence,
          "modelUsed",
          "tokensUsed",
          "createdAt"
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, 'rag-v2-scaffold', 1150, NOW())
        ON CONFLICT (id) DO NOTHING
      `,
      [
        record.recommendationId,
        userId,
        record.inputId,
        JSON.stringify(record.diagnosis),
        record.confidence,
      ]
    );

    for (const productId of record.linkedProducts) {
      await db.query(
        `
          INSERT INTO "ProductRecommendation" (
            id,
            "recommendationId",
            "productId",
            reason,
            "applicationRate",
            priority,
            "searchTimestamp",
            "createdAt"
          )
          VALUES ($1, $2, $3, 'Demo seeded recommendation', NULL, 1, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `,
        [randomUUID(), record.recommendationId, productId]
      );
    }

    await upsertDemoCitationSources(record.recommendationId, record.crop, record.citationSources);
  }

  return {
    inputs: demoRecords.length,
    recommendations: demoRecords.length,
    products: demoProducts.length,
    productLinks: demoRecords.reduce((acc, item) => acc + item.linkedProducts.length, 0),
  };
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
        await runDiscoveryStep(payload, summary, auth.userId);
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
