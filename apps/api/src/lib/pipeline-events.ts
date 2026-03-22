import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type PipelineEventSeverity = 'info' | 'warn' | 'error';

export interface PipelineEventInput {
  pipeline: string;
  stage: string;
  severity: PipelineEventSeverity;
  message: string;
  runId?: string | null;
  sourceId?: string | null;
  recommendationId?: string | null;
  userId?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown>;
}

interface PgErrorLike {
  code?: string;
}

function isMissingTableError(error: unknown): boolean {
  const code = (error as PgErrorLike | null)?.code;
  return code === '42P01' || code === '42703';
}

export async function recordPipelineEvent(
  db: Pool,
  event: PipelineEventInput
): Promise<void> {
  const metadata = event.metadata ?? {};
  const payload = {
    pipeline: event.pipeline,
    stage: event.stage,
    severity: event.severity,
    message: event.message,
    runId: event.runId ?? null,
    sourceId: event.sourceId ?? null,
    recommendationId: event.recommendationId ?? null,
    userId: event.userId ?? null,
    url: event.url ?? null,
    metadata,
  };

  if (event.severity === 'error') {
    console.error('[PipelineEvent]', payload);
  } else if (event.severity === 'warn') {
    console.warn('[PipelineEvent]', payload);
  } else {
    console.log('[PipelineEvent]', payload);
  }

  try {
    await db.query(
      `
        INSERT INTO "PipelineEventLog" (
          id,
          pipeline,
          stage,
          severity,
          message,
          "runId",
          "sourceId",
          "recommendationId",
          "userId",
          url,
          metadata,
          "createdAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW())
      `,
      [
        randomUUID(),
        event.pipeline,
        event.stage,
        event.severity,
        event.message.slice(0, 1000),
        event.runId ?? null,
        event.sourceId ?? null,
        event.recommendationId ?? null,
        event.userId ?? null,
        event.url ?? null,
        JSON.stringify(metadata),
      ]
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      return;
    }
    console.error('[PipelineEvent] failed to persist', {
      error: (error as Error).message,
      pipeline: event.pipeline,
      stage: event.stage,
      severity: event.severity,
    });
  }
}
