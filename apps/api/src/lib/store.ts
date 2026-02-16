import { randomUUID } from 'node:crypto';
import type {
  CreateInputAccepted,
  CreateInputCommand,
  JobStatus,
  RecommendationJobStatusResponse,
} from '@crop-copilot/contracts';

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

function buildIdempotencyLookupKey(userId: string, idempotencyKey: string): string {
  return `${userId}:${idempotencyKey.trim().toLowerCase()}`;
}

export interface RecommendationStore {
  enqueueInput(userId: string, payload: CreateInputCommand): CreateInputAccepted;
  getJobStatus(jobId: string, userId: string): RecommendationJobStatusResponse | null;
}

export class InMemoryRecommendationStore implements RecommendationStore {
  private readonly inputsById = new Map<string, StoredInput>();
  private readonly jobById = new Map<string, StoredJob>();
  private readonly inputIdByIdempotencyKey = new Map<string, string>();

  enqueueInput(userId: string, payload: CreateInputCommand): CreateInputAccepted {
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
    };
  }

  getJobStatus(jobId: string, userId: string): RecommendationJobStatusResponse | null {
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

export function getRecommendationStore(): RecommendationStore {
  if (!singletonStore) {
    singletonStore = new InMemoryRecommendationStore();
  }

  return singletonStore;
}

export function setRecommendationStore(store: RecommendationStore | null): void {
  singletonStore = store;
}
