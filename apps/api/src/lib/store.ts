import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type {
  CreateInputAccepted,
  CreateInputCommand,
  JobStatus,
  RecommendationResult,
  RecommendationJobStatusResponse,
  SyncInputRecord,
  SyncPullRequest,
  SyncPullResponse,
} from '@crop-copilot/contracts';
import { SyncPullRequestSchema } from '@crop-copilot/contracts';
import {
  decodeSyncCursor,
  encodeSyncCursor,
  normalizeIdempotencyKey,
} from '@crop-copilot/domain';
import { PostgresRecommendationStore } from './postgres-store';

interface StoredInput {
  inputId: string;
  userId: string;
  payload: CreateInputCommand;
  createdAt: string;
  updatedAt: string;
  jobId: string;
}

interface StoredJob {
  jobId: string;
  inputId: string;
  userId: string;
  status: JobStatus;
  updatedAt: string;
  failureReason?: string;
  result?: RecommendationResult;
}

function buildIdempotencyLookupKey(userId: string, idempotencyKey: string): string {
  return `${userId}:${normalizeIdempotencyKey(idempotencyKey)}`;
}

export interface EnqueueInputResult extends CreateInputAccepted {
  wasCreated: boolean;
}

export interface RecommendationStore {
  enqueueInput(userId: string, payload: CreateInputCommand): Promise<EnqueueInputResult>;
  getJobStatus(
    jobId: string,
    userId: string
  ): Promise<RecommendationJobStatusResponse | null>;
  pullSyncRecords(userId: string, request: SyncPullRequest): Promise<SyncPullResponse>;
  updateJobStatus(
    jobId: string,
    userId: string,
    status: JobStatus,
    failureReason?: string
  ): Promise<void>;
  saveRecommendationResult(
    jobId: string,
    userId: string,
    result: RecommendationResult
  ): Promise<void>;
}

export class InMemoryRecommendationStore implements RecommendationStore {
  private readonly inputsById = new Map<string, StoredInput>();
  private readonly jobById = new Map<string, StoredJob>();
  private readonly inputIdByIdempotencyKey = new Map<string, string>();

  async enqueueInput(
    userId: string,
    payload: CreateInputCommand
  ): Promise<EnqueueInputResult> {
    const idempotencyLookupKey = buildIdempotencyLookupKey(
      userId,
      payload.idempotencyKey
    );
    const existingInputId = this.inputIdByIdempotencyKey.get(idempotencyLookupKey);
    if (existingInputId) {
      const existingInput = this.inputsById.get(existingInputId);
      if (existingInput) {
        const existingJob = this.jobById.get(existingInput.jobId);

        return {
          inputId: existingInput.inputId,
          jobId: existingInput.jobId,
          status: existingJob?.status ?? 'queued',
          acceptedAt: existingInput.createdAt,
          wasCreated: false,
        };
      }

      this.inputIdByIdempotencyKey.delete(idempotencyLookupKey);
    }

    const now = new Date().toISOString();
    const inputId = randomUUID();
    const jobId = randomUUID();
    const normalizedPayload: CreateInputCommand = {
      ...payload,
      idempotencyKey: normalizeIdempotencyKey(payload.idempotencyKey),
    };

    this.inputsById.set(inputId, {
      inputId,
      userId,
      payload: normalizedPayload,
      createdAt: now,
      updatedAt: now,
      jobId,
    });

    this.jobById.set(jobId, {
      jobId,
      inputId,
      userId,
      status: 'queued',
      updatedAt: now,
    });
    this.inputIdByIdempotencyKey.set(idempotencyLookupKey, inputId);

    return {
      inputId,
      jobId,
      status: 'queued',
      acceptedAt: now,
      wasCreated: true,
    };
  }

  async getJobStatus(
    jobId: string,
    userId: string
  ): Promise<RecommendationJobStatusResponse | null> {
    const job = this.jobById.get(jobId);
    if (!job) {
      return null;
    }

    if (job.userId !== userId) {
      return null;
    }

    return {
      inputId: job.inputId,
      jobId: job.jobId,
      status: job.status,
      updatedAt: job.updatedAt,
      failureReason: job.failureReason,
      result: job.result,
    };
  }

  async pullSyncRecords(userId: string, request: SyncPullRequest): Promise<SyncPullResponse> {
    const parsedRequest = SyncPullRequestSchema.parse(request);
    const items: SyncInputRecord[] = [];

    for (const input of this.inputsById.values()) {
      if (input.userId !== userId) {
        continue;
      }

      const job = this.jobById.get(input.jobId);
      if (!job) {
        continue;
      }

      if (!parsedRequest.includeCompletedJobs && job.status === 'completed') {
        continue;
      }

      const updatedAt = job.updatedAt > input.updatedAt ? job.updatedAt : input.updatedAt;

      items.push({
        inputId: input.inputId,
        createdAt: input.createdAt,
        updatedAt,
        type: input.payload.type,
        crop: input.payload.crop ?? null,
        location: input.payload.location ?? null,
        status: job.status,
        recommendationId: job.result?.recommendationId ?? null,
      });
    }

    items.sort(compareSyncRecords);

    const cursor = parsedRequest.cursor ? decodeSyncCursor(parsedRequest.cursor) : null;
    const filtered = cursor
      ? items.filter((item) => isAfterCursor(item, cursor.createdAt, cursor.inputId))
      : items;

    const paged = filtered.slice(0, parsedRequest.limit + 1);
    const hasMore = paged.length > parsedRequest.limit;
    const visibleItems = hasMore ? paged.slice(0, parsedRequest.limit) : paged;

    const lastItem = visibleItems.at(-1);
    const nextCursor =
      hasMore && lastItem
        ? encodeSyncCursor({
            createdAt: lastItem.createdAt,
            inputId: lastItem.inputId,
          })
        : null;

    return {
      items: visibleItems,
      nextCursor,
      hasMore,
      serverTimestamp: new Date().toISOString(),
    };
  }

  async updateJobStatus(
    jobId: string,
    userId: string,
    status: JobStatus,
    failureReason?: string
  ): Promise<void> {
    const job = this.jobById.get(jobId);
    if (!job || job.userId !== userId) {
      return;
    }

    job.status = status;
    job.updatedAt = new Date().toISOString();
    job.failureReason = failureReason;
    this.jobById.set(jobId, job);

    const input = this.inputsById.get(job.inputId);
    if (input) {
      input.updatedAt = job.updatedAt;
      this.inputsById.set(input.inputId, input);
    }
  }

  async saveRecommendationResult(
    jobId: string,
    userId: string,
    result: RecommendationResult
  ): Promise<void> {
    const job = this.jobById.get(jobId);
    if (!job || job.userId !== userId) {
      return;
    }

    job.result = result;
    job.updatedAt = new Date().toISOString();
    this.jobById.set(jobId, job);

    const input = this.inputsById.get(job.inputId);
    if (input) {
      input.updatedAt = job.updatedAt;
      this.inputsById.set(input.inputId, input);
    }
  }
}

function compareSyncRecords(a: SyncInputRecord, b: SyncInputRecord): number {
  if (a.createdAt > b.createdAt) {
    return -1;
  }
  if (a.createdAt < b.createdAt) {
    return 1;
  }

  return b.inputId.localeCompare(a.inputId);
}

function isAfterCursor(
  item: SyncInputRecord,
  cursorCreatedAt: string,
  cursorInputId: string
): boolean {
  if (item.createdAt < cursorCreatedAt) {
    return true;
  }
  if (item.createdAt > cursorCreatedAt) {
    return false;
  }

  return item.inputId < cursorInputId;
}

let singletonStore: RecommendationStore | null = null;
let sharedPool: Pool | null = null;

function createPostgresStore(): RecommendationStore {
  if (!sharedPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required when DATA_BACKEND=postgres');
    }

    sharedPool = new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.PG_POOL_MAX ?? 5),
      ssl:
        process.env.PG_SSL_MODE === 'disable'
          ? false
          : {
              rejectUnauthorized: false,
            },
    });
  }

  return new PostgresRecommendationStore(sharedPool);
}

export function getRecommendationStore(): RecommendationStore {
  if (!singletonStore) {
    singletonStore =
      process.env.DATA_BACKEND === 'postgres'
        ? createPostgresStore()
        : new InMemoryRecommendationStore();
  }

  return singletonStore;
}

export function setRecommendationStore(store: RecommendationStore | null): void {
  singletonStore = store;
}
