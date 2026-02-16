import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type {
  CreateInputCommand,
  JobStatus,
  RecommendationResult,
  RecommendationJobStatusResponse,
} from '@crop-copilot/contracts';
import type { EnqueueInputResult, RecommendationStore } from './store';

interface ExistingCommandRow {
  input_id: string;
  job_id: string;
  status: RecommendationJobStatusResponse['status'];
  accepted_at: Date;
}

interface InsertedInputRow {
  input_id: string;
  created_at: Date;
}

interface JobStatusRow {
  input_id: string;
  job_id: string;
  status: RecommendationJobStatusResponse['status'];
  updated_at: Date;
  failure_reason: string | null;
  result_payload: RecommendationResult | null;
}

export class PostgresRecommendationStore implements RecommendationStore {
  constructor(private readonly pool: Pool) {}

  async enqueueInput(
    userId: string,
    payload: CreateInputCommand
  ): Promise<EnqueueInputResult> {
    return this.withTransaction(async (client) => {
      const inputId = randomUUID();
      const insertedInput = await client.query<InsertedInputRow>(
        `
          INSERT INTO app_input_command (id, user_id, idempotency_key, payload, created_at, updated_at)
          VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
          ON CONFLICT (user_id, idempotency_key) DO NOTHING
          RETURNING id AS input_id, created_at
        `,
        [inputId, userId, payload.idempotencyKey, JSON.stringify(payload)]
      );

      if (insertedInput.rows.length === 0) {
        const existing = await client.query<ExistingCommandRow>(
          `
            SELECT i.id AS input_id,
                   j.id AS job_id,
                   j.status,
                   j.created_at AS accepted_at
            FROM app_input_command i
            JOIN app_recommendation_job j ON j.input_id = i.id
            WHERE i.user_id = $1
              AND i.idempotency_key = $2
            LIMIT 1
          `,
          [userId, payload.idempotencyKey]
        );

        if (existing.rows.length === 0) {
          throw new Error('Existing idempotent input command found without recommendation job');
        }

        const existingRow = existing.rows[0];
        return {
          inputId: existingRow.input_id,
          jobId: existingRow.job_id,
          status: existingRow.status,
          acceptedAt: existingRow.accepted_at.toISOString(),
          wasCreated: false,
        };
      }

      const insertedRow = insertedInput.rows[0];
      const jobId = randomUUID();

      await client.query(
        `
          INSERT INTO app_recommendation_job (id, input_id, user_id, status, created_at, updated_at)
          VALUES ($1, $2, $3, 'queued', NOW(), NOW())
        `,
        [jobId, insertedRow.input_id, userId]
      );

      return {
        inputId: insertedRow.input_id,
        jobId,
        status: 'queued',
        acceptedAt: insertedRow.created_at.toISOString(),
        wasCreated: true,
      };
    });
  }

  async getJobStatus(
    jobId: string,
    userId: string
  ): Promise<RecommendationJobStatusResponse | null> {
    const result = await this.pool.query<JobStatusRow>(
      `
        SELECT input_id,
               id AS job_id,
               status,
               updated_at,
               failure_reason,
               result_payload
        FROM app_recommendation_job
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [jobId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      inputId: row.input_id,
      jobId: row.job_id,
      status: row.status,
      updatedAt: row.updated_at.toISOString(),
      failureReason: row.failure_reason ?? undefined,
      result: row.result_payload ?? undefined,
    };
  }

  async updateJobStatus(
    jobId: string,
    userId: string,
    status: JobStatus,
    failureReason?: string
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE app_recommendation_job
        SET status = $3,
            failure_reason = $4,
            updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
      `,
      [jobId, userId, status, failureReason ?? null]
    );
  }

  async saveRecommendationResult(
    jobId: string,
    userId: string,
    result: RecommendationResult
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE app_recommendation_job
        SET result_payload = $3::jsonb,
            updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
      `,
      [jobId, userId, JSON.stringify(result)]
    );
  }

  private async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
