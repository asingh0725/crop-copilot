import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { CROPS } from '../ingestion/discovery-seeds';

interface RecommendationRow {
  recommendation_id: string;
  input_crop: string | null;
  input_description: string | null;
  diagnosis: unknown;
}

interface SourceChunkRow {
  chunk_id: string;
  source_title: string;
  content: string;
}

interface OutputRecommendation {
  action?: string;
  priority?: string;
  timing?: string;
  details?: string;
  citations?: string[];
}

interface OutputDiagnosisPayload {
  diagnosis?: unknown;
  recommendations?: OutputRecommendation[];
  products?: unknown[];
  confidence?: number;
  generatedAt?: string;
  inputId?: string;
  userId?: string;
  jobId?: string;
  retrievalQuery?: string;
}

const CROP_ALIAS_ENTRIES: Array<{ canonical: string; alias: string }> = buildCropAliasEntries();

function parseNumberFlag(name: string, fallback: number): number {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index < 0 || index + 1 >= process.argv.length) {
    return fallback;
  }
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function isTransientDbError(error: unknown): boolean {
  const message = (error as Error)?.message?.toLowerCase() ?? '';
  return (
    message.includes('connection terminated unexpectedly') ||
    message.includes('terminating connection') ||
    message.includes('connection reset') ||
    message.includes('econnreset') ||
    message.includes('server closed the connection unexpectedly')
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCropTerm(value: string): string {
  return value.trim().toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCropHints(crop: string): string[] {
  const normalized = normalizeCropTerm(crop);
  if (!normalized) {
    return [];
  }

  const hints = new Set<string>([normalized]);
  if (normalized.endsWith('s')) {
    hints.add(normalized.slice(0, -1));
  } else {
    hints.add(`${normalized}s`);
  }
  if (normalized === 'corn') {
    hints.add('maize');
  }
  if (normalized === 'soybean' || normalized === 'soybeans') {
    hints.add('soybean');
    hints.add('soybeans');
    hints.add('soya');
  }
  if (normalized === 'sugarbeet') {
    hints.add('sugar beet');
  }
  if (normalized === 'sugar beet') {
    hints.add('sugarbeet');
  }

  return [...hints].filter((hint) => hint.length > 2);
}

function buildCropRegex(hints: string[]): RegExp | null {
  if (hints.length === 0) {
    return null;
  }
  const terms = hints.map((hint) => escapeRegex(hint)).sort((a, b) => b.length - a.length);
  return new RegExp(`(^|[^a-z0-9])(?:${terms.join('|')})([^a-z0-9]|$)`, 'i');
}

function includesAny(text: string, terms: Set<string>): boolean {
  for (const term of terms) {
    if (!term) continue;
    const matcher = new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}([^a-z0-9]|$)`, 'i');
    if (matcher.test(text)) {
      return true;
    }
  }
  return false;
}

function buildAuditAliases(crop: string): Set<string> {
  const aliases = new Set<string>();
  const normalized = normalizeCropTerm(crop);
  if (!normalized) {
    return aliases;
  }
  aliases.add(normalized);
  if (normalized.endsWith('s')) {
    aliases.add(normalized.slice(0, -1));
  } else {
    aliases.add(`${normalized}s`);
  }
  if (normalized === 'corn') aliases.add('maize');
  if (normalized === 'soybeans' || normalized === 'soybean') {
    aliases.add('soybean');
    aliases.add('soybeans');
    aliases.add('soya');
  }
  return aliases;
}

function isAuditAlignedChunk(chunk: SourceChunkRow, crop: string): boolean {
  const aliases = buildAuditAliases(crop);
  if (aliases.size === 0) {
    return false;
  }
  const sample = `${chunk.source_title} ${chunk.content.slice(0, 320)}`.toLowerCase();
  return includesAny(sample, aliases);
}

function detectCropMentions(text: string): Set<string> {
  const mentions = new Set<string>();
  const normalized = text.toLowerCase();
  for (const entry of CROP_ALIAS_ENTRIES) {
    const matcher = new RegExp(`(^|[^a-z0-9])${escapeRegex(entry.alias)}([^a-z0-9]|$)`, 'i');
    if (matcher.test(normalized)) {
      mentions.add(entry.canonical);
    }
  }
  return mentions;
}

function normalizeCropCanonical(crop: string): string {
  const normalized = normalizeCropTerm(crop);
  if (!normalized) {
    return '';
  }
  const match = CROP_ALIAS_ENTRIES.find((entry) => entry.alias === normalized);
  return match?.canonical ?? normalized;
}

function isCropAlignedChunk(chunk: SourceChunkRow, crop: string): boolean {
  const hints = buildCropHints(crop);
  if (hints.length === 0) {
    return false;
  }
  const regex = buildCropRegex(hints);
  const haystack = `${chunk.source_title.toLowerCase()} ${chunk.content.toLowerCase()}`;
  if (regex && regex.test(haystack)) {
    return true;
  }

  const target = normalizeCropCanonical(crop);
  const mentions = detectCropMentions(haystack);
  return mentions.has(target);
}

function mutateDiagnosisCitations(
  diagnosis: unknown,
  preferredChunkIds: string[]
): OutputDiagnosisPayload {
  const root =
    diagnosis && typeof diagnosis === 'object' && !Array.isArray(diagnosis)
      ? ({ ...(diagnosis as Record<string, unknown>) } as OutputDiagnosisPayload)
      : {};

  const existing = Array.isArray(root.recommendations) ? root.recommendations : [];
  const rewritten = existing.map((recommendation, index) => {
    const citation = preferredChunkIds[index % preferredChunkIds.length] ?? preferredChunkIds[0];
    return {
      ...recommendation,
      citations: citation ? [citation] : [],
    };
  });
  root.recommendations = rewritten;
  return root;
}

function buildCropAliasEntries(): Array<{ canonical: string; alias: string }> {
  const aliases = new Map<string, string>();
  const addAlias = (canonicalRaw: string, aliasRaw: string): void => {
    const canonical = normalizeCropTerm(canonicalRaw);
    const alias = normalizeCropTerm(aliasRaw);
    if (!canonical || !alias) {
      return;
    }
    aliases.set(alias, canonical);
  };

  for (const crop of CROPS) {
    const canonical = normalizeCropTerm(crop);
    addAlias(canonical, canonical);
    if (canonical.endsWith('s')) {
      addAlias(canonical, canonical.slice(0, -1));
    } else {
      addAlias(canonical, `${canonical}s`);
    }
  }

  addAlias('corn', 'maize');
  addAlias('soybeans', 'soybean');
  addAlias('soybeans', 'soya');
  addAlias('sugarbeet', 'sugar beet');
  addAlias('tomatoes', 'tomato');
  addAlias('potatoes', 'potato');
  addAlias('onions', 'onion');
  addAlias('carrots', 'carrot');
  addAlias('cucumbers', 'cucumber');
  addAlias('peppers', 'pepper');
  addAlias('apples', 'apple');
  addAlias('almonds', 'almond');
  addAlias('peaches', 'peach');
  addAlias('grapes', 'grape');
  addAlias('blueberries', 'blueberry');
  addAlias('strawberries', 'strawberry');

  return [...aliases.entries()].map(([alias, canonical]) => ({ canonical, alias }));
}

async function fetchCurrentSourceChunks(
  client: PoolClient,
  recommendationId: string
): Promise<SourceChunkRow[]> {
  const result = await client.query<SourceChunkRow>(
    `
      SELECT
        rs."textChunkId" AS chunk_id,
        COALESCE(s.title, '') AS source_title,
        COALESCE(tc.content, '') AS content
      FROM "RecommendationSource" rs
      JOIN "TextChunk" tc ON tc.id = rs."textChunkId"
      JOIN "Source" s ON s.id = tc."sourceId"
      WHERE rs."recommendationId" = $1
    `,
    [recommendationId]
  );
  return result.rows;
}

async function fetchFallbackAlignedChunks(
  client: PoolClient,
  crop: string,
  description: string | null,
  limit: number
): Promise<SourceChunkRow[]> {
  const hints = buildCropHints(crop);
  if (hints.length === 0) {
    return [];
  }
  const regex = buildCropRegex(hints);
  const regexSource = regex?.source ?? '';
  const queryTerm = asString(description).toLowerCase().slice(0, 140);

  const result = await client.query<SourceChunkRow>(
    `
      SELECT
        tc.id AS chunk_id,
        COALESCE(s.title, '') AS source_title,
        COALESCE(tc.content, '') AS content
      FROM "TextChunk" tc
      JOIN "Source" s ON s.id = tc."sourceId"
      WHERE s.status IN ('ready', 'processed')
        AND (
          lower(tc.content) ~ $1
          OR lower(s.title) ~ $1
        )
      ORDER BY
        CASE
          WHEN $2::text <> '' AND lower(tc.content) LIKE '%' || $2 || '%' THEN 0
          ELSE 1
        END,
        tc."createdAt" DESC
      LIMIT $3
    `,
    [regexSource, queryTerm, Math.max(limit, 2)]
  );

  return result.rows;
}

async function replaceRecommendationSources(
  client: PoolClient,
  recommendationId: string,
  chunkIds: string[]
): Promise<void> {
  await client.query(
    `DELETE FROM "RecommendationSource" WHERE "recommendationId" = $1`,
    [recommendationId]
  );

  for (let index = 0; index < chunkIds.length; index += 1) {
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
      [randomUUID(), recommendationId, chunkIds[index], Math.max(0.2, 0.9 - index * 0.15)]
    );
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const limit = parseNumberFlag('limit', 300);
  const sourceLimit = parseNumberFlag('source-limit', 3);
  const dryRun = hasFlag('dry-run');

  const pool = new Pool({
    connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
    ssl: resolvePoolSslConfig(),
    max: Number(process.env.PG_POOL_MAX ?? 4),
    idleTimeoutMillis: Number(process.env.PG_POOL_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.PG_POOL_CONNECTION_TIMEOUT_MS ?? 15_000),
    keepAlive: true,
    keepAliveInitialDelayMillis: Number(process.env.PG_POOL_KEEPALIVE_INITIAL_DELAY_MS ?? 10_000),
  });
  pool.on('error', (error) => {
    console.error('[RepairCropAlignment] pool error', {
      error: (error as Error).message,
    });
  });

  try {
    const recommendations = await pool.query<RecommendationRow>(
      `
        SELECT
          r.id AS recommendation_id,
          r.diagnosis,
          i.crop AS input_crop,
          i.description AS input_description
        FROM "Recommendation" r
        JOIN "Input" i ON i.id = r."inputId"
        WHERE i.crop IS NOT NULL
        ORDER BY r."createdAt" DESC
        LIMIT $1
      `,
      [limit]
    );

    let inspected = 0;
    let repaired = 0;
    let skipped = 0;

    for (const row of recommendations.rows) {
      inspected += 1;
      const crop = asString(row.input_crop);
      if (!crop) {
        skipped += 1;
        continue;
      }

      let handled = false;
      let attempts = 0;
      while (!handled && attempts < 3) {
        attempts += 1;
        const client = await pool.connect();
        client.on('error', (error) => {
          console.error('[RepairCropAlignment] client error', {
            recommendationId: row.recommendation_id,
            attempt: attempts,
            error: (error as Error).message,
          });
        });
        try {
          const currentChunks = await fetchCurrentSourceChunks(client, row.recommendation_id);
          const auditAlignedCurrent = currentChunks.filter((chunk) =>
            isAuditAlignedChunk(chunk, crop)
          );
          const alignedCurrent = currentChunks.filter((chunk) =>
            isCropAlignedChunk(chunk, crop)
          );
          const fallbackChunks = await fetchFallbackAlignedChunks(
            client,
            crop,
            row.input_description,
            Math.max(sourceLimit * 12, 24)
          );
          const auditAlignedFallback = fallbackChunks.filter((chunk) =>
            isAuditAlignedChunk(chunk, crop)
          );
          const alignedFallback = fallbackChunks
            .filter((chunk) => isCropAlignedChunk(chunk, crop))
            .slice(0, sourceLimit);
          const alignedAuditFallback = auditAlignedFallback
            .filter((chunk) => isCropAlignedChunk(chunk, crop))
            .slice(0, sourceLimit);

          let selectedChunks: SourceChunkRow[] = [];
          if (auditAlignedCurrent.length > 0) {
            selectedChunks = auditAlignedCurrent.slice(0, sourceLimit);
          } else if (alignedAuditFallback.length > 0) {
            selectedChunks = alignedAuditFallback;
          } else if (alignedCurrent.length > 0) {
            selectedChunks = alignedCurrent.slice(0, sourceLimit);
          } else {
            selectedChunks = alignedFallback;
          }

          if (selectedChunks.length === 0) {
            skipped += 1;
            handled = true;
            continue;
          }

          if (dryRun) {
            repaired += 1;
            handled = true;
            continue;
          }

          const selectedChunkIds = selectedChunks.map((chunk) => chunk.chunk_id);
          const rewrittenDiagnosis = mutateDiagnosisCitations(row.diagnosis, selectedChunkIds);

          await client.query('BEGIN');
          await replaceRecommendationSources(client, row.recommendation_id, selectedChunkIds);
          await client.query(
            `
              UPDATE "Recommendation"
              SET diagnosis = $2::jsonb
              WHERE id = $1
            `,
            [row.recommendation_id, JSON.stringify(rewrittenDiagnosis)]
          );
          await client.query('COMMIT');
          repaired += 1;
          handled = true;
        } catch (error) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // no-op: transaction may not have started.
          }
          if (!isTransientDbError(error) || attempts >= 3) {
            skipped += 1;
            handled = true;
            console.error('[RepairCropAlignment] failed', {
              recommendationId: row.recommendation_id,
              attempt: attempts,
              error: (error as Error).message,
            });
          } else {
            console.warn('[RepairCropAlignment] transient db error, retrying', {
              recommendationId: row.recommendation_id,
              attempt: attempts,
              error: (error as Error).message,
            });
            await sleep(750 * attempts);
          }
        } finally {
          client.removeAllListeners('error');
          client.release();
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          dryRun,
          inspected,
          repaired,
          skipped,
          limit,
          sourceLimit,
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
  console.error('[RepairCropAlignment] fatal', {
    error: (error as Error).message,
  });
  process.exitCode = 1;
});
