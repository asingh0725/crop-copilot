import type { Pool } from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  getDefaultModelArtifact,
  isInHouseModelArtifact,
  type InHouseLinearModelArtifact,
  type InHouseModelMetrics,
  type SupportedModelType,
} from './in-house-models';

interface ModelVersionRow {
  id: string;
  backend: string | null;
  artifact: unknown;
  trained_at: Date;
  feedback_count: number;
  ndcg_score: number | null;
  metrics: unknown;
}

interface CacheEntry {
  artifact: InHouseLinearModelArtifact;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export async function getLatestDeployedModelArtifact(
  db: Pool,
  params: {
    modelType: SupportedModelType;
    featureNames: string[];
    cacheTtlMs?: number;
  }
): Promise<InHouseLinearModelArtifact> {
  const cacheKey = `${params.modelType}:${params.featureNames.join(',')}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.artifact;
  }

  const result = await db.query<ModelVersionRow>(
    `
      SELECT
        id,
        backend,
        artifact,
        "trainedAt" AS trained_at,
        "feedbackCount" AS feedback_count,
        "ndcgScore" AS ndcg_score,
        metrics
      FROM "MLModelVersion"
      WHERE "modelType" = $1
        AND status = 'deployed'
      ORDER BY "trainedAt" DESC
      LIMIT 1
    `,
    [params.modelType]
  );

  const row = result.rows[0];
  const artifact =
    row && isInHouseModelArtifact(row.artifact)
      ? {
          ...row.artifact,
          trainedAt: row.trained_at.toISOString(),
          sampleCount: Number(row.feedback_count ?? row.artifact.sampleCount ?? 0),
          metrics: normalizeMetrics(row.artifact.metrics ?? row.metrics),
        }
      : getDefaultModelArtifact(params.modelType, params.featureNames);

  cache.set(cacheKey, {
    artifact,
    expiresAt: now + (params.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS),
  });

  return artifact;
}

export async function deployInHouseModelArtifact(
  db: Pool,
  params: {
    modelVersionId: string;
    artifact: InHouseLinearModelArtifact;
    bucket?: string | null;
    region?: string | null;
  }
): Promise<{ s3Uri: string | null }> {
  const s3Uri = await uploadArtifactToS3(params.artifact, params.modelVersionId, {
    bucket: params.bucket ?? null,
    region: params.region ?? null,
  });

  await db.query('BEGIN');
  try {
    await db.query(
      `
        UPDATE "MLModelVersion"
        SET status = 'retired', "updatedAt" = NOW()
        WHERE "modelType" = $1
          AND status = 'deployed'
          AND id <> $2
      `,
      [params.artifact.modelType, params.modelVersionId]
    );

    await db.query(
      `
        UPDATE "MLModelVersion"
        SET
          status = 'deployed',
          backend = $2,
          artifact = $3::jsonb,
          metrics = $4::jsonb,
          "ndcgScore" = $5,
          "s3Uri" = $6,
          "trainedAt" = NOW(),
          "updatedAt" = NOW()
        WHERE id = $1
      `,
      [
        params.modelVersionId,
        params.artifact.backend,
        JSON.stringify(params.artifact),
        JSON.stringify(params.artifact.metrics ?? {}),
        averageNdcg(params.artifact),
        s3Uri,
      ]
    );

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  invalidateCache(params.artifact.modelType);
  return { s3Uri };
}

export async function retireModelVersion(
  db: Pool,
  modelVersionId: string
): Promise<void> {
  await db.query(
    `
      UPDATE "MLModelVersion"
      SET status = 'retired', "updatedAt" = NOW()
      WHERE id = $1
    `,
    [modelVersionId]
  );
  cache.clear();
}

function invalidateCache(modelType: SupportedModelType): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${modelType}:`)) {
      cache.delete(key);
    }
  }
}

async function uploadArtifactToS3(
  artifact: InHouseLinearModelArtifact,
  modelVersionId: string,
  options: {
    bucket: string | null;
    region: string | null;
  }
): Promise<string | null> {
  if (!options.bucket) {
    return null;
  }

  const key = `models/in-house/${artifact.modelType}/${modelVersionId}.json`;
  const client = new S3Client({
    region: options.region ?? process.env.AWS_REGION ?? 'us-west-2',
  });

  await client.send(
    new PutObjectCommand({
      Bucket: options.bucket,
      Key: key,
      Body: Buffer.from(JSON.stringify(artifact, null, 2), 'utf-8'),
      ContentType: 'application/json',
    })
  );

  return `s3://${options.bucket}/${key}`;
}

function averageNdcg(artifact: InHouseLinearModelArtifact): number | null {
  const scores = [artifact.metrics.ndcgAt3, artifact.metrics.ndcgAt5].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );
  if (scores.length === 0) {
    return null;
  }
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function normalizeMetrics(value: unknown): InHouseModelMetrics {
  if (!value || typeof value !== 'object') {
    return {
      ndcgAt3: null,
      ndcgAt5: null,
      baselineNdcgAt3: null,
      baselineNdcgAt5: null,
      pairwiseAccuracy: null,
      baselinePairwiseAccuracy: null,
    };
  }

  const metrics = value as Record<string, unknown>;
  return {
    ndcgAt3: asNumber(metrics.ndcgAt3),
    ndcgAt5: asNumber(metrics.ndcgAt5),
    baselineNdcgAt3: asNumber(metrics.baselineNdcgAt3),
    baselineNdcgAt5: asNumber(metrics.baselineNdcgAt5),
    pairwiseAccuracy: asNumber(metrics.pairwiseAccuracy),
    baselinePairwiseAccuracy: asNumber(metrics.baselinePairwiseAccuracy),
  };
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
