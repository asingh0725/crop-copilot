import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type {
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
import { recordRecommendationUsageAndChargeOverage } from './entitlements';
import type {
  EnqueueInputOptions,
  EnqueueInputResult,
  RecommendationStore,
} from './store';

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

interface SyncRow {
  input_id: string;
  input_created_at: Date;
  input_updated_at: Date;
  job_updated_at: Date;
  input_type: 'PHOTO' | 'LAB_REPORT' | null;
  crop: string | null;
  location: string | null;
  status: RecommendationJobStatusResponse['status'];
  recommendation_id: string | null;
}

interface InputCropRow {
  crop: string | null;
}

interface CatalogProductRow {
  id: string;
  name: string;
  brand: string | null;
  type: string;
  application_rate: string | null;
  description: string | null;
}

interface ParsedDiagnosisProduct {
  productId: string | null;
  productName: string | null;
  reason: string | null;
  applicationRate: string | null;
  alternatives: string[];
}

interface DiagnosisContext {
  condition: string | null;
  conditionType: string;
  reasoning: string | null;
  recommendationActions: string[];
  products: ParsedDiagnosisProduct[];
}

interface ProductRecommendationCandidate {
  productId: string;
  reason: string;
  applicationRate: string | null;
  searchQuery: string;
}

const MAX_PRODUCT_RECOMMENDATIONS = 3;
const CONDITION_TYPES = new Set([
  'deficiency',
  'disease',
  'pest',
  'environmental',
  'unknown',
]);

export class PostgresRecommendationStore implements RecommendationStore {
  constructor(private readonly pool: Pool) {}

  async enqueueInput(
    userId: string,
    payload: CreateInputCommand,
    options?: EnqueueInputOptions
  ): Promise<EnqueueInputResult> {
    const normalizedKey = normalizeIdempotencyKey(payload.idempotencyKey);
    const normalizedPayload: CreateInputCommand = {
      ...payload,
      idempotencyKey: normalizedKey,
    };
    const userEmail = normalizeUserEmail(options?.email, userId);

    return this.withTransaction(async (client) => {
      const inputId = randomUUID();
      const insertedInput = await client.query<InsertedInputRow>(
        `
          INSERT INTO app_input_command (id, user_id, idempotency_key, payload, created_at, updated_at)
          VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
          ON CONFLICT (user_id, idempotency_key) DO NOTHING
          RETURNING id AS input_id, created_at
        `,
        [inputId, userId, normalizedKey, JSON.stringify(normalizedPayload)]
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
          [userId, normalizedKey]
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

      await this.ensureLegacyUser(client, userId, userEmail);
      await this.upsertLegacyInput(client, insertedRow.input_id, userId, normalizedPayload);

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

  async pullSyncRecords(userId: string, request: SyncPullRequest): Promise<SyncPullResponse> {
    const parsedRequest = SyncPullRequestSchema.parse(request);
    const values: Array<string | number> = [userId];
    const conditions = ['i.user_id = $1'];

    if (!parsedRequest.includeCompletedJobs) {
      values.push('completed');
      conditions.push(`j.status <> $${values.length}`);
    }

    if (parsedRequest.cursor) {
      const cursor = decodeSyncCursor(parsedRequest.cursor);
      values.push(cursor.createdAt);
      const createdAtIndex = values.length;
      values.push(cursor.inputId);
      const inputIdIndex = values.length;
      conditions.push(
        `(i.created_at < $${createdAtIndex}::timestamptz OR (i.created_at = $${createdAtIndex}::timestamptz AND i.id < $${inputIdIndex}::uuid))`
      );
    }

    values.push(parsedRequest.limit + 1);
    const limitIndex = values.length;

    const result = await this.pool.query<SyncRow>(
      `
        SELECT i.id AS input_id,
               i.created_at AS input_created_at,
               i.updated_at AS input_updated_at,
               j.updated_at AS job_updated_at,
               i.payload->>'type' AS input_type,
               i.payload->>'crop' AS crop,
               i.payload->>'location' AS location,
               j.status,
               j.result_payload->>'recommendationId' AS recommendation_id
        FROM app_input_command i
        JOIN app_recommendation_job j ON j.input_id = i.id
        WHERE ${conditions.join('\n          AND ')}
        ORDER BY i.created_at DESC, i.id DESC
        LIMIT $${limitIndex}
      `,
      values
    );

    const hasMore = result.rows.length > parsedRequest.limit;
    const rows = hasMore ? result.rows.slice(0, parsedRequest.limit) : result.rows;
    const items = rows.map((row) => this.toSyncRecord(row));
    const lastItem = items.at(-1);
    const nextCursor =
      hasMore && lastItem
        ? encodeSyncCursor({
            createdAt: lastItem.createdAt,
            inputId: lastItem.inputId,
          })
        : null;

    return {
      items,
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
    let finalInputId: string | null = null;
    let finalRecommendationId: string | null = null;

    await this.withTransaction(async (client) => {
      const persistedResult = { ...result };

      const updatedJob = await client.query<{ input_id: string }>(
        `
          UPDATE app_recommendation_job
          SET result_payload = $3::jsonb,
              updated_at = NOW()
          WHERE id = $1
            AND user_id = $2
          RETURNING input_id
        `,
        [jobId, userId, JSON.stringify(persistedResult)]
      );

      const inputId = updatedJob.rows[0]?.input_id;
      if (!inputId) {
        return;
      }
      finalInputId = inputId;

      const recommendationId = await this.upsertLegacyRecommendation(
        client,
        userId,
        inputId,
        persistedResult
      );
      finalRecommendationId = recommendationId;

      if (recommendationId !== persistedResult.recommendationId) {
        persistedResult.recommendationId = recommendationId;
        await client.query(
          `
            UPDATE app_recommendation_job
            SET result_payload = $3::jsonb,
                updated_at = NOW()
            WHERE id = $1
              AND user_id = $2
          `,
          [jobId, userId, JSON.stringify(persistedResult)]
        );
      }

      await this.syncRecommendationSources(client, recommendationId, persistedResult);
      await this.syncProductRecommendations(
        client,
        recommendationId,
        inputId,
        persistedResult
      );
    });

    if (finalRecommendationId && finalInputId) {
      try {
        await recordRecommendationUsageAndChargeOverage(
          this.pool,
          userId,
          finalRecommendationId,
          finalInputId
        );
      } catch (error) {
        console.error('Failed to record recommendation usage for entitlement metering', {
          jobId,
          userId,
          recommendationId: finalRecommendationId,
          error: (error as Error).message,
        });
      }
    }
  }

  private async ensureLegacyUser(
    client: PoolClient,
    userId: string,
    email: string
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO "User" (id, email, "createdAt", "updatedAt")
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `,
      [userId, email]
    );
  }

  private async upsertLegacyInput(
    client: PoolClient,
    inputId: string,
    userId: string,
    payload: CreateInputCommand
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO "Input" (
          id,
          "userId",
          type,
          "imageUrl",
          description,
          "labData",
          location,
          crop,
          season,
          "fieldAcreage",
          "plannedApplicationDate",
          "fieldLatitude",
          "fieldLongitude",
          "createdAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (id) DO UPDATE
          SET "imageUrl" = EXCLUDED."imageUrl",
              description = EXCLUDED.description,
              "labData" = EXCLUDED."labData",
              location = EXCLUDED.location,
              crop = EXCLUDED.crop,
              season = EXCLUDED.season,
              "fieldAcreage" = EXCLUDED."fieldAcreage",
              "plannedApplicationDate" = EXCLUDED."plannedApplicationDate",
              "fieldLatitude" = EXCLUDED."fieldLatitude",
              "fieldLongitude" = EXCLUDED."fieldLongitude"
      `,
      [
        inputId,
        userId,
        payload.type,
        payload.imageUrl ?? null,
        payload.description ?? null,
        payload.labData ? JSON.stringify(payload.labData) : null,
        payload.location ?? null,
        payload.crop ?? null,
        payload.season ?? null,
        payload.fieldAcreage ?? null,
        payload.plannedApplicationDate ?? null,
        payload.fieldLatitude ?? null,
        payload.fieldLongitude ?? null,
      ]
    );
  }

  private async upsertLegacyRecommendation(
    client: PoolClient,
    userId: string,
    inputId: string,
    result: RecommendationResult
  ): Promise<string> {
    const existing = await client.query<{ id: string }>(
      `
        SELECT id
        FROM "Recommendation"
        WHERE "inputId" = $1
        LIMIT 1
      `,
      [inputId]
    );

    const recommendationId = existing.rows[0]?.id ?? result.recommendationId;

    if (existing.rows.length > 0) {
      await client.query(
        `
          UPDATE "Recommendation"
          SET diagnosis = $2::jsonb,
              confidence = $3,
              "modelUsed" = $4
          WHERE id = $1
        `,
        [
          recommendationId,
          JSON.stringify(result.diagnosis),
          result.confidence,
          result.modelUsed,
        ]
      );
      return recommendationId;
    }

    await client.query(
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
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, NULL, NOW())
      `,
      [
        recommendationId,
        userId,
        inputId,
        JSON.stringify(result.diagnosis),
        result.confidence,
        result.modelUsed,
      ]
    );

    return recommendationId;
  }

  private async syncRecommendationSources(
    client: PoolClient,
    recommendationId: string,
    result: RecommendationResult
  ): Promise<void> {
    await client.query(
      `
        DELETE FROM "RecommendationSource"
        WHERE "recommendationId" = $1
      `,
      [recommendationId]
    );

    for (let index = 0; index < result.sources.length; index += 1) {
      const source = result.sources[index];
      const existingChunks = await client.query<{
        has_text: boolean;
        has_image: boolean;
      }>(
        `
          SELECT EXISTS (SELECT 1 FROM "TextChunk" WHERE id = $1) AS has_text,
                 EXISTS (SELECT 1 FROM "ImageChunk" WHERE id = $1) AS has_image
        `,
        [source.chunkId]
      );

      const chunk = existingChunks.rows[0];
      let hasTextChunk = Boolean(chunk?.has_text);
      let hasImageChunk = Boolean(chunk?.has_image);

      if (!hasTextChunk && !hasImageChunk) {
        await this.upsertSyntheticSourceChunk(client, source.chunkId, source.excerpt, index);
        hasTextChunk = true;
      }

      await client.query(
        `
          INSERT INTO "RecommendationSource" (
            id,
            "recommendationId",
            "textChunkId",
            "imageChunkId",
            "relevanceScore"
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          randomUUID(),
          recommendationId,
          hasTextChunk ? source.chunkId : null,
          hasImageChunk ? source.chunkId : null,
          source.relevance,
        ]
      );
    }
  }

  private async upsertSyntheticSourceChunk(
    client: PoolClient,
    chunkId: string,
    excerpt: string,
    index: number
  ): Promise<void> {
    const syntheticSourceId = `aws-source-${chunkId}`;
    await client.query(
      `
        INSERT INTO "Source" (
          id,
          title,
          url,
          "sourceType",
          institution,
          status,
          "chunksCount",
          "errorMessage",
          "createdAt",
          "updatedAt",
          metadata
        )
        VALUES (
          $1,
          $2,
          NULL,
          'UNIVERSITY_EXTENSION',
          'Crop Copilot Knowledge Base',
          'ready',
          1,
          NULL,
          NOW(),
          NOW(),
          $3::jsonb
        )
        ON CONFLICT (id) DO UPDATE
          SET title = EXCLUDED.title,
              institution = EXCLUDED.institution,
              status = EXCLUDED.status,
              "chunksCount" = GREATEST("Source"."chunksCount", 1),
              metadata = EXCLUDED.metadata,
              "updatedAt" = NOW()
      `,
      [
        syntheticSourceId,
        `Evidence ${index + 1}`,
        JSON.stringify({
          generatedBy: 'aws-runtime',
          chunkId,
        }),
      ]
    );

    await client.query(
      `
        INSERT INTO "TextChunk" (
          id,
          "sourceId",
          content,
          embedding,
          metadata,
          "createdAt",
          "chunkIndex",
          "contentHash"
        )
        VALUES ($1, $2, $3, NULL, $4::jsonb, NOW(), $5, NULL)
        ON CONFLICT (id) DO UPDATE
          SET content = EXCLUDED.content,
              metadata = EXCLUDED.metadata,
              "chunkIndex" = EXCLUDED."chunkIndex"
      `,
      [
        chunkId,
        syntheticSourceId,
        excerpt,
        JSON.stringify({
          generatedBy: 'aws-runtime',
          kind: 'pipeline-evidence',
        }),
        index,
      ]
    );
  }

  private async syncProductRecommendations(
    client: PoolClient,
    recommendationId: string,
    inputId: string,
    result: RecommendationResult
  ): Promise<void> {
    await client.query(
      `
        DELETE FROM "ProductRecommendation"
        WHERE "recommendationId" = $1
      `,
      [recommendationId]
    );

    const inputResult = await client.query<InputCropRow>(
      `
        SELECT crop
        FROM "Input"
        WHERE id = $1
        LIMIT 1
      `,
      [inputId]
    );

    const crop = inputResult.rows[0]?.crop ?? null;
    const diagnosisContext = extractDiagnosisContext(result.diagnosis);

    let selectedProducts = await this.resolveProductsFromDiagnosisPayload(
      client,
      diagnosisContext
    );
    if (selectedProducts.length === 0) {
      selectedProducts = await this.resolveCatalogFallbackProducts(
        client,
        crop,
        diagnosisContext
      );
    }

    for (
      let index = 0;
      index < selectedProducts.length && index < MAX_PRODUCT_RECOMMENDATIONS;
      index += 1
    ) {
      const item = selectedProducts[index];
      await client.query(
        `
          INSERT INTO "ProductRecommendation" (
            id,
            "recommendationId",
            "productId",
            reason,
            "applicationRate",
            priority,
            "searchQuery",
            "searchTimestamp",
            "createdAt"
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        `,
        [
          randomUUID(),
          recommendationId,
          item.productId,
          item.reason,
          item.applicationRate,
          index + 1,
          item.searchQuery,
        ]
      );
    }
  }

  private async resolveProductsFromDiagnosisPayload(
    client: PoolClient,
    context: DiagnosisContext
  ): Promise<ProductRecommendationCandidate[]> {
    if (context.products.length === 0) {
      return [];
    }

    const candidateIds: string[] = [];
    const seenIds = new Set<string>();
    const candidateNames: string[] = [];
    const seenNames = new Set<string>();
    for (const product of context.products) {
      for (const id of [product.productId, ...product.alternatives]) {
        if (!id || seenIds.has(id)) {
          continue;
        }
        seenIds.add(id);
        candidateIds.push(id);
      }

      if (product.productName) {
        const normalizedName = product.productName.toLowerCase();
        if (!seenNames.has(normalizedName)) {
          seenNames.add(normalizedName);
          candidateNames.push(normalizedName);
        }
      }
    }

    if (candidateIds.length === 0 && candidateNames.length === 0) {
      return [];
    }

    const baseSelect = `
      SELECT
        id,
        name,
        brand,
        type::text AS type,
        "applicationRate" AS application_rate,
        description
      FROM "Product"
    `;

    const idMatches =
      candidateIds.length > 0
        ? await client.query<CatalogProductRow>(
            `
              ${baseSelect}
              WHERE id = ANY($1::text[])
            `,
            [candidateIds]
          )
        : { rows: [] as CatalogProductRow[] };

    const nameMatches =
      candidateNames.length > 0
        ? await client.query<CatalogProductRow>(
            `
              ${baseSelect}
              WHERE lower(name) = ANY($1::text[])
            `,
            [candidateNames]
          )
        : { rows: [] as CatalogProductRow[] };

    const fallbackNameMatches =
      candidateNames.length > 0 && idMatches.rows.length + nameMatches.rows.length === 0
        ? await client.query<CatalogProductRow>(
            `
              ${baseSelect}
              WHERE EXISTS (
                SELECT 1
                FROM unnest($1::text[]) AS candidate_name
                WHERE lower(name) LIKE '%' || candidate_name || '%'
              )
              ORDER BY "updatedAt" DESC
              LIMIT 20
            `,
            [candidateNames]
          )
        : { rows: [] as CatalogProductRow[] };

    const mergedCatalogRows = dedupeCatalogRows([
      ...idMatches.rows,
      ...nameMatches.rows,
      ...fallbackNameMatches.rows,
    ]);

    if (mergedCatalogRows.length === 0) {
      return [];
    }

    const productById = new Map(mergedCatalogRows.map((row) => [row.id, row]));
    const productByName = new Map(
      mergedCatalogRows.map((row) => [row.name.trim().toLowerCase(), row])
    );
    const resolved: ProductRecommendationCandidate[] = [];
    const usedProductIds = new Set<string>();

    for (const product of context.products) {
      const options = [product.productId, ...product.alternatives].filter(
        (entry): entry is string => Boolean(entry)
      );
      let matchedProduct = options
        .map((id) => productById.get(id))
        .find(
          (entry): entry is CatalogProductRow =>
            entry !== undefined && !usedProductIds.has(entry.id)
        );

      if (!matchedProduct && product.productName) {
        const normalizedName = product.productName.trim().toLowerCase();
        const exact = productByName.get(normalizedName);
        if (exact && !usedProductIds.has(exact.id)) {
          matchedProduct = exact;
        } else {
          const fuzzy = mergedCatalogRows.find(
            (entry) =>
              !usedProductIds.has(entry.id) &&
              entry.name.trim().toLowerCase().includes(normalizedName)
          );
          if (fuzzy) {
            matchedProduct = fuzzy;
          }
        }
      }

      if (!matchedProduct) {
        continue;
      }

      usedProductIds.add(matchedProduct.id);
      resolved.push({
        productId: matchedProduct.id,
        reason:
          product.reason ??
          buildFallbackProductReason(matchedProduct, context, null),
        applicationRate: product.applicationRate ?? matchedProduct.application_rate,
        searchQuery: 'precomputed:model-output',
      });

      if (resolved.length >= MAX_PRODUCT_RECOMMENDATIONS) {
        break;
      }
    }

    return resolved;
  }

  private async resolveCatalogFallbackProducts(
    client: PoolClient,
    crop: string | null,
    context: DiagnosisContext
  ): Promise<ProductRecommendationCandidate[]> {
    const preferredTypes = inferProductTypeHints(
      context.conditionType,
      context.condition,
      context.recommendationActions
    );

    const baseSelect = `
      SELECT
        id,
        name,
        brand,
        type::text AS type,
        "applicationRate" AS application_rate,
        description
      FROM "Product"
    `;

    const catalogResult = await client.query<CatalogProductRow>(
      `
        ${baseSelect}
        WHERE (
          CARDINALITY($2::text[]) = 0
          OR type::text = ANY($2::text[])
        )
          AND (
            $1::text IS NULL
            OR EXISTS (
              SELECT 1
              FROM unnest(crops) AS crop_name
              WHERE lower(crop_name) = lower($1)
            )
            OR cardinality(crops) = 0
          )
        ORDER BY
          CASE
            WHEN $1::text IS NULL THEN 0
            WHEN EXISTS (
              SELECT 1
              FROM unnest(crops) AS crop_name
              WHERE lower(crop_name) = lower($1)
            ) THEN 0
            WHEN cardinality(crops) = 0 THEN 1
            ELSE 2
          END,
          "updatedAt" DESC
        LIMIT $3
      `,
      [crop, preferredTypes, MAX_PRODUCT_RECOMMENDATIONS]
    );

    const relaxedRows =
      catalogResult.rows.length > 0
        ? catalogResult.rows
        : (
            await client.query<CatalogProductRow>(
              `
                ${baseSelect}
                ORDER BY "updatedAt" DESC
                LIMIT $1
              `,
              [MAX_PRODUCT_RECOMMENDATIONS]
            )
          ).rows;

    return relaxedRows.map((row) => ({
      productId: row.id,
      reason: buildFallbackProductReason(row, context, crop),
      applicationRate: row.application_rate,
      searchQuery: `precomputed:catalog:${context.conditionType}`,
    }));
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

  private toSyncRecord(row: SyncRow): SyncInputRecord {
    const updatedAt =
      row.job_updated_at > row.input_updated_at ? row.job_updated_at : row.input_updated_at;
    const type = row.input_type === 'LAB_REPORT' ? 'LAB_REPORT' : 'PHOTO';

    return {
      inputId: row.input_id,
      createdAt: row.input_created_at.toISOString(),
      updatedAt: updatedAt.toISOString(),
      type,
      crop: row.crop,
      location: row.location,
      status: row.status,
      recommendationId: row.recommendation_id,
    };
  }
}

function normalizeUserEmail(email: string | undefined, userId: string): string {
  if (email && email.length > 3 && email.includes('@')) {
    return email;
  }

  return `${userId}@placeholder.local`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const values: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const normalized = asNonEmptyString(entry);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    values.push(normalized);
  }

  return values;
}

function asStringCandidate(value: unknown): string | null {
  if (typeof value === 'string') {
    return asNonEmptyString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function resolveDiagnosisProductsArray(
  root: Record<string, unknown>,
  diagnosisNode: Record<string, unknown>
): unknown[] {
  const candidates = [
    root.products,
    root.recommendedProducts,
    root.productRecommendations,
    diagnosisNode.products,
    diagnosisNode.recommendedProducts,
    diagnosisNode.productRecommendations,
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function dedupeCatalogRows(rows: CatalogProductRow[]): CatalogProductRow[] {
  const deduped: CatalogProductRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) {
      continue;
    }
    seen.add(row.id);
    deduped.push(row);
  }

  return deduped;
}

function inferConditionType(
  rawConditionType: string | null,
  condition: string | null,
  reasoning: string | null,
  actions: string[]
): string {
  if (rawConditionType && CONDITION_TYPES.has(rawConditionType)) {
    return rawConditionType;
  }

  const text = [condition ?? '', reasoning ?? '', actions.join(' ')]
    .join(' ')
    .toLowerCase();

  if (/(deficien|chlorosis|nutrient|fertility|nitrogen|phosphorus|potassium|npk)/.test(text)) {
    return 'deficiency';
  }
  if (/(pest|insect|mite|aphid|worm|beetle|bug|borer|thrip)/.test(text)) {
    return 'pest';
  }
  if (/(drought|heat|cold|frost|water|environment|wind|stress)/.test(text)) {
    return 'environmental';
  }
  if (/(disease|blight|rust|mold|mildew|fung|bacter|viral|pathogen|lesion)/.test(text)) {
    return 'disease';
  }

  return 'unknown';
}

function inferProductTypeHints(
  conditionType: string,
  condition: string | null,
  actions: string[]
): string[] {
  const inferred = new Set<string>();
  const text = [condition ?? '', actions.join(' ')].join(' ').toLowerCase();

  if (conditionType === 'deficiency' || /(deficien|chlorosis|nutrient|npk|nitrogen)/.test(text)) {
    inferred.add('FERTILIZER');
    inferred.add('AMENDMENT');
  }

  if (conditionType === 'disease' || /(fung|mildew|blight|rot|rust|spot|pathogen)/.test(text)) {
    inferred.add('FUNGICIDE');
    inferred.add('BIOLOGICAL');
  }

  if (conditionType === 'pest' || /(insect|aphid|worm|beetle|mite|borer|pest)/.test(text)) {
    inferred.add('INSECTICIDE');
    inferred.add('BIOLOGICAL');
  }

  if (conditionType === 'environmental' || /(stress|drought|water|heat|soil structure)/.test(text)) {
    inferred.add('AMENDMENT');
  }

  if (inferred.size === 0) {
    inferred.add('BIOLOGICAL');
    inferred.add('AMENDMENT');
    inferred.add('FERTILIZER');
  }

  return Array.from(inferred);
}

function extractDiagnosisContext(diagnosisPayload: unknown): DiagnosisContext {
  const root = asRecord(diagnosisPayload) ?? {};
  const diagnosisNode = asRecord(root.diagnosis) ?? root;
  const recommendations = Array.isArray(root.recommendations) ? root.recommendations : [];
  const products = resolveDiagnosisProductsArray(root, diagnosisNode);

  const recommendationActions = recommendations
    .map((recommendation) => asNonEmptyString(asRecord(recommendation)?.action))
    .filter((action): action is string => Boolean(action))
    .slice(0, 6);

  const parsedProducts = products
    .map((product) => {
      const item = asRecord(product);
      if (!item) {
        return null;
      }

      const nestedProduct = asRecord(item.product);
      const productId =
        asStringCandidate(item.productId) ??
        asStringCandidate(item.product_id) ??
        asStringCandidate(item.id) ??
        asStringCandidate(nestedProduct?.id);
      const productName =
        asStringCandidate(item.productName) ??
        asStringCandidate(item.product_name) ??
        asStringCandidate(item.name) ??
        asStringCandidate(nestedProduct?.name);

      if (!productId && !productName) {
        return null;
      }

      const alternatives = [
        ...asStringArray(item.alternatives),
        ...asStringArray(item.alternativeIds),
      ];

      return {
        productId,
        productName,
        reason:
          asStringCandidate(item.reason) ??
          asStringCandidate(item.reasoning),
        applicationRate:
          asStringCandidate(item.applicationRate) ??
          asStringCandidate(item.application_rate),
        alternatives,
      } satisfies ParsedDiagnosisProduct;
    })
    .filter((product): product is ParsedDiagnosisProduct => Boolean(product));

  const condition = asNonEmptyString(diagnosisNode.condition);
  const reasoning = asNonEmptyString(diagnosisNode.reasoning);
  const rawConditionType = asNonEmptyString(diagnosisNode.conditionType);

  return {
    condition,
    conditionType: inferConditionType(
      rawConditionType,
      condition,
      reasoning,
      recommendationActions
    ),
    reasoning,
    recommendationActions,
    products: parsedProducts,
  };
}

function buildFallbackProductReason(
  product: CatalogProductRow,
  context: DiagnosisContext,
  crop: string | null
): string {
  const description = asNonEmptyString(product.description);
  if (description) {
    return description.length > 220 ? `${description.slice(0, 217)}...` : description;
  }

  const cropLabel = crop ?? 'this crop';
  const issueLabel = context.condition ?? context.conditionType;
  const brandPart = product.brand ? ` by ${product.brand}` : '';
  return `${product.name}${brandPart} aligns with ${cropLabel} management for ${issueLabel}.`;
}
