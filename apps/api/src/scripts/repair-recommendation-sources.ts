import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';

interface RecommendationRow {
  recommendation_id: string;
  source_payload: unknown;
}

interface SourcePayloadItem {
  chunkId: string;
  relevance: number;
  excerpt: string;
}

interface ExistingChunkRow {
  exists: boolean;
}

function parseNumberArg(flag: string, fallback: number): number {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index < 0) return fallback;
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSources(value: unknown): SourcePayloadItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const obj = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
      if (!obj) return null;
      const chunkId = asString(obj.chunkId);
      if (!chunkId) return null;
      return {
        chunkId,
        relevance: Math.max(0, Math.min(1, asNumber(obj.relevance, 0.5))),
        excerpt: asString(obj.excerpt).slice(0, 1000),
      };
    })
    .filter((item): item is SourcePayloadItem => item !== null);
}

async function ensureSyntheticChunk(
  client: PoolClient,
  chunkId: string,
  excerpt: string,
  index: number
): Promise<void> {
  const existsResult = await client.query<ExistingChunkRow>(
    `SELECT EXISTS (SELECT 1 FROM "TextChunk" WHERE id = $1) AS exists`,
    [chunkId]
  );
  if (existsResult.rows[0]?.exists) {
    return;
  }

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
        generatedBy: 'repair-script',
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
        SET
          content = EXCLUDED.content,
          metadata = EXCLUDED.metadata,
          "chunkIndex" = EXCLUDED."chunkIndex"
    `,
    [
      chunkId,
      syntheticSourceId,
      excerpt || 'Synthetic evidence chunk restored from recommendation payload.',
      JSON.stringify({
        generatedBy: 'repair-script',
        kind: 'pipeline-evidence',
      }),
      index,
    ]
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const limit = parseNumberArg('--limit', 500);
  const dryRun = process.argv.includes('--dry-run');

  const pool = new Pool({
    connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
    ssl: resolvePoolSslConfig(),
    max: Number(process.env.PG_POOL_MAX ?? 4),
  });

  try {
    const rows = await pool.query<RecommendationRow>(
      `
        SELECT
          r.id AS recommendation_id,
          j.result_payload->'sources' AS source_payload
        FROM "Recommendation" r
        JOIN LATERAL (
          SELECT result_payload
          FROM app_recommendation_job j
          WHERE j.input_id = r."inputId"::uuid
            AND j.user_id = r."userId"::uuid
            AND j.result_payload->>'recommendationId' = r.id
          ORDER BY j.updated_at DESC
          LIMIT 1
        ) j ON TRUE
        WHERE EXISTS (
          SELECT 1
          FROM "RecommendationSource" rs
          WHERE rs."recommendationId" = r.id
            AND rs."textChunkId" IS NULL
        )
        ORDER BY r."createdAt" DESC
        LIMIT $1
      `,
      [limit]
    );

    let repaired = 0;
    let repairedSourceRows = 0;

    for (const row of rows.rows) {
      const sources = parseSources(row.source_payload);
      if (sources.length === 0) {
        continue;
      }

      if (dryRun) {
        repaired += 1;
        repairedSourceRows += sources.length;
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `DELETE FROM "RecommendationSource" WHERE "recommendationId" = $1`,
          [row.recommendation_id]
        );

        for (let index = 0; index < sources.length; index += 1) {
          const source = sources[index];
          await ensureSyntheticChunk(client, source.chunkId, source.excerpt, index);
          await client.query(
            `
              INSERT INTO "RecommendationSource" (
                id,
                "recommendationId",
                "textChunkId",
                "imageChunkId",
                "relevanceScore"
              )
              VALUES ($1, $2, $3, NULL, $4)
            `,
            [
              randomUUID(),
              row.recommendation_id,
              source.chunkId,
              source.relevance,
            ]
          );
        }

        await client.query('COMMIT');
        repaired += 1;
        repairedSourceRows += sources.length;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('[RepairRecommendationSources] failed', {
          recommendationId: row.recommendation_id,
          error: (error as Error).message,
        });
      } finally {
        client.release();
      }
    }

    const remaining = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM "RecommendationSource"
        WHERE "textChunkId" IS NULL
      `
    );

    console.log(
      JSON.stringify(
        {
          dryRun,
          inspectedRecommendations: rows.rows.length,
          repairedRecommendations: repaired,
          repairedSourceRows,
          remainingNullSourceRows: Number(remaining.rows[0]?.count ?? 0),
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[RepairRecommendationSources] fatal', {
    error: (error as Error).message,
  });
  process.exitCode = 1;
});

