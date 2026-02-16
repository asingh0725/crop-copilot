import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type {
  CreateInputAccepted,
  CreateInputCommand,
  JobStatus,
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
}

export interface RecommendationStore {
  enqueueInput(userId: string, payload: CreateInputCommand): Promise<CreateInputAccepted>;
  getJobStatus(
    jobId: string,
    userId: string
  ): Promise<RecommendationJobStatusResponse | null>;
}

export class InMemoryRecommendationStore implements RecommendationStore {
  private readonly inputsById = new Map<string, StoredInput>();
  private readonly jobById = new Map<string, StoredJob>();

  async enqueueInput(
    userId: string,
    payload: CreateInputCommand
  ): Promise<CreateInputAccepted> {
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

    return {
      inputId,
      jobId,
      status: 'queued',
      acceptedAt: now,
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
    };
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
