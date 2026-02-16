import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type {
  CreateInputAccepted,
  CreateInputCommand,
  JobStatus,
  RecommendationResult,
  RecommendationJobStatusResponse,
} from '@crop-copilot/contracts';
import { PostgresRecommendationStore } from './postgres-store';

interface StoredInput {
  inputId: string;
  userId: string;
  payload: CreateInputCommand;
  createdAt: string;
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
  return `${userId}:${idempotencyKey.trim().toLowerCase()}`;
}

export interface RecommendationStore {
  enqueueInput(userId: string, payload: CreateInputCommand): Promise<EnqueueInputResult>;
  getJobStatus(
    jobId: string,
    userId: string
  ): Promise<RecommendationJobStatusResponse | null>;
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

export interface EnqueueInputResult extends CreateInputAccepted {
  wasCreated: boolean;
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
    const existingInputId =
      this.inputIdByIdempotencyKey.get(idempotencyLookupKey);
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

    this.inputsById.set(inputId, {
      inputId,
      userId,
      payload,
      createdAt: now,
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
  }
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
