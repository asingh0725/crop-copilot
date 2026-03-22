import type { EventBridgeHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { COMPLIANCE_CROPS, US_STATES } from '../compliance/seed-matrix';
import {
  extractDiscoveryUrlsFromGeminiCandidate,
  filterReachableDiscoveryUrls,
} from '../ingestion/discovery-url-utils';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const DEFAULT_GEMINI_TIMEOUT_MS = 25_000;

interface DiscoveryRow {
  id: string;
  state: string;
  crop: string;
}

interface GeminiGroundingChunk {
  web?: { uri?: string; title?: string };
}

interface DiscoveredSource {
  url: string;
  title: string;
  sourceType: string;
}

let sharedPool: Pool | null = null;

function getPool(): Pool {
  if (!sharedPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    sharedPool = new Pool({
      connectionString: sanitizeDatabaseUrlForPool(databaseUrl),
      max: 3,
      ssl: resolvePoolSslConfig(),
    });
  }
  return sharedPool;
}

function inferSourceType(url: string, title: string): string {
  const text = `${url} ${title}`.toLowerCase();
  if (text.includes('.gov') || text.includes('department of agriculture')) return 'government';
  if (text.includes('.edu') || text.includes('extension')) return 'university_extension';
  return 'regulatory';
}

async function searchComplianceSources(crop: string, state: string): Promise<DiscoveredSource[]> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is not configured');
  }

  const prompt = [
    `Find authoritative pesticide compliance and label sources for ${crop} in ${state}, United States.`,
    'Prioritize .gov, state department of agriculture, EPA resources, university extension compliance pages.',
    'Exclude retailer and blog pages.',
    'Return only a JSON array of objects with keys: url, title, sourceType.',
    'Use canonical destination URLs only (no redirect links and no search-result URLs).',
    'sourceType must be one of: government, university_extension, regulatory.',
  ].join(' ');

  const timeoutMs = Number(
    process.env.COMPLIANCE_DISCOVERY_GEMINI_TIMEOUT_MS ?? DEFAULT_GEMINI_TIMEOUT_MS
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`Gemini request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`Gemini error ${response.status}: ${message.slice(0, 120)}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
      groundingMetadata?: {
        groundingChunks?: GeminiGroundingChunk[];
      };
    }>;
  };

  const candidate = payload.candidates?.[0];
  const parsedEntries = extractDiscoveryUrlsFromGeminiCandidate(candidate, 8);
  const reachableEntries = await filterReachableDiscoveryUrls(parsedEntries, 8);
  const sources: DiscoveredSource[] = [];

  for (const entry of reachableEntries) {
    const title = entry.title || `${crop} compliance - ${state}`;
    sources.push({
      url: entry.url,
      title,
      sourceType: inferSourceType(
        entry.url,
        entry.sourceTypeHint ? `${title} ${entry.sourceTypeHint}` : title
      ),
    });

    if (sources.length >= 8) {
      break;
    }
  }

  return sources;
}

async function seedDiscoveryQueue(pool: Pool): Promise<void> {
  const pairs = US_STATES.flatMap((state) =>
    COMPLIANCE_CROPS.map((crop) => ({ state, crop }))
  );

  const values = pairs.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
  const params = pairs.flatMap((pair) => [pair.state, pair.crop]);

  await pool.query(
    `
      INSERT INTO "ComplianceDiscoveryQueue" (state, crop)
      VALUES ${values}
      ON CONFLICT (state, crop) DO NOTHING
    `,
    params
  );
}

async function claimBatch(pool: Pool, batchSize: number): Promise<DiscoveryRow[]> {
  const result = await pool.query<DiscoveryRow>(
    `
      UPDATE "ComplianceDiscoveryQueue"
      SET status = 'running'
      WHERE id IN (
        SELECT id
        FROM "ComplianceDiscoveryQueue"
        WHERE status IN ('pending', 'error')
        ORDER BY "lastDiscoveredAt" ASC NULLS FIRST
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, state, crop
    `,
    [batchSize]
  );

  return result.rows;
}

async function resetStuckRunningRows(pool: Pool): Promise<void> {
  await pool.query(
    `
      UPDATE "ComplianceDiscoveryQueue"
      SET status = 'pending'
      WHERE status = 'running'
    `
  );
}

async function registerSource(
  pool: Pool,
  row: DiscoveryRow,
  source: DiscoveredSource
): Promise<void> {
  const tags = JSON.stringify(['compliance', row.state, row.crop]);

  await pool.query(
    `
      INSERT INTO "ComplianceSource" (
        url,
        title,
        "sourceType",
        jurisdiction,
        state,
        crop,
        status,
        priority,
        "freshnessHours",
        tags,
        "createdAt",
        "updatedAt"
      )
      VALUES ($1, $2, $3, 'US', $4, $5, 'pending', 'high', 12, $6::jsonb, NOW(), NOW())
      ON CONFLICT (url) DO UPDATE
        SET
          title = EXCLUDED.title,
          "sourceType" = EXCLUDED."sourceType",
          state = EXCLUDED.state,
          crop = EXCLUDED.crop,
          status = 'pending',
          tags = EXCLUDED.tags,
          "updatedAt" = NOW()
    `,
    [source.url, source.title, source.sourceType, row.state, row.crop, tags]
  );
}

async function markRow(
  pool: Pool,
  rowId: string,
  status: 'completed' | 'error',
  sourcesFound: number
): Promise<void> {
  await pool.query(
    `
      UPDATE "ComplianceDiscoveryQueue"
      SET
        status = $1,
        "sourcesFound" = $2,
        "lastDiscoveredAt" = NOW()
      WHERE id = $3
    `,
    [status, sourcesFound, rowId]
  );
}

async function processRowsConcurrently(
  rows: DiscoveryRow[],
  concurrency: number,
  handler: (row: DiscoveryRow) => Promise<void>
): Promise<void> {
  let index = 0;
  const workerCount = Math.max(1, Math.min(concurrency, rows.length || 1));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = index;
      index += 1;
      const row = rows[currentIndex];
      if (!row) {
        return;
      }
      await handler(row);
    }
  });

  await Promise.allSettled(workers);
}

export const handler: EventBridgeHandler<
  'crop-copilot.compliance.discovery.scheduled',
  {
    trigger?: 'scheduled' | 'manual';
    batchSize?: number;
  },
  void
> = async (event) => {
  const pool = getPool();
  const requestedBatchSize = Number(event.detail?.batchSize ?? 0);
  const fallbackBatchSize = Number(process.env.COMPLIANCE_DISCOVERY_BATCH_SIZE ?? 25);
  const batchSize =
    Number.isFinite(requestedBatchSize) && requestedBatchSize > 0
      ? Math.min(Math.floor(requestedBatchSize), 100)
      : fallbackBatchSize;

  await seedDiscoveryQueue(pool);
  await resetStuckRunningRows(pool);
  const rows = await claimBatch(pool, batchSize);
  const concurrency = Math.min(
    Math.max(Number(process.env.COMPLIANCE_DISCOVERY_CONCURRENCY ?? 8), 1),
    16
  );

  await processRowsConcurrently(rows, concurrency, async (row) => {
    try {
      const discovered = await searchComplianceSources(row.crop, row.state);
      for (const source of discovered) {
        await registerSource(pool, row, source);
      }
      await markRow(pool, row.id, 'completed', discovered.length);
    } catch (error) {
      console.error('[ComplianceDiscovery] Failed row', {
        rowId: row.id,
        crop: row.crop,
        state: row.state,
        error: (error as Error).message,
      });
      await markRow(pool, row.id, 'error', 0);
    }
  });
};
