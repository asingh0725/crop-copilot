/**
 * Crop × region source discovery worker (EventBridge Lambda)
 *
 * Runs every 2 minutes. For each scheduled invocation:
 *   1. Seeds the CropRegionDiscovery table with all crop × region combinations
 *      (idempotent — ON CONFLICT DO NOTHING)
 *   2. Picks the next DISCOVERY_BATCH_SIZE pending combinations
 *   3. For each: calls Gemini 2.0 Flash with Google Search grounding to find
 *      authoritative agricultural URLs (extension services, government, research)
 *   4. Registers each discovered URL as a Source (tagged with crop + region)
 *      and immediately enqueues it for scraping
 *   5. Marks combinations complete; re-queues combinations older than 90 days
 *
 * Environment variables:
 *   DATABASE_URL          — Postgres connection string
 *   GOOGLE_AI_API_KEY     — Google AI Studio API key for Gemini search grounding
 *   SQS_INGESTION_QUEUE_URL — SQS queue URL (used by ingestion queue)
 *   DISCOVERY_BATCH_SIZE  — combinations per run (default: 10)
 */

import type { EventBridgeHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { getIngestionQueue } from '../queue/ingestion-queue';
import { CROPS, REGIONS } from '../ingestion/discovery-seeds';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const REDISCOVERY_DAYS = 90;

interface DiscoveryRow {
  id: string;
  crop: string;
  region: string;
}

interface GeminiGroundingChunk {
  web?: { uri?: string; title?: string };
}

interface DiscoveredSource {
  url: string;
  title: string;
  sourceType: 'GOVERNMENT' | 'UNIVERSITY_EXTENSION' | 'RESEARCH_PAPER';
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

// ── Gemini search grounding ───────────────────────────────────────────────────

async function searchWithGemini(crop: string, region: string): Promise<DiscoveredSource[]> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[Discovery] GOOGLE_AI_API_KEY not set — skipping Gemini search');
    return [];
  }

  const prompt =
    `Find 5-8 authoritative web URLs about ${crop} crop cultivation, disease management, ` +
    `and pest control specifically in ${region}. ` +
    `Prioritize university extension services (.edu), government agricultural agencies (.gov), ` +
    `and peer-reviewed research institutions. ` +
    `Exclude news sites, retailers, social media, and Wikipedia.`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      console.warn(`[Discovery] Gemini API error ${response.status}: ${err.slice(0, 200)}`);
      return [];
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        groundingMetadata?: {
          groundingChunks?: GeminiGroundingChunk[];
        };
      }>;
    };

    const chunks = payload.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const seen = new Set<string>();
    const sources: DiscoveredSource[] = [];

    for (const chunk of chunks) {
      const uri = chunk.web?.uri?.trim();
      const title = chunk.web?.title?.trim() ?? '';
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);

      // Basic URL validation
      try {
        new URL(uri);
      } catch {
        continue;
      }

      sources.push({ url: uri, title, sourceType: inferSourceType(uri, title) });
      if (sources.length >= 8) break;
    }

    return sources;
  } catch (error) {
    console.warn('[Discovery] Gemini search failed:', (error as Error).message);
    return [];
  }
}

function inferSourceType(url: string, title: string = ''): DiscoveredSource['sourceType'] {
  // Gemini 2.5 returns redirect URLs — check both URL and title for domain hints
  const candidates = [url, title].join(' ').toLowerCase();
  if (candidates.includes('.gov') || candidates.includes(' gov ')) return 'GOVERNMENT';
  if (
    candidates.includes('.edu') ||
    candidates.includes('extension') ||
    candidates.includes('university') ||
    candidates.includes('college')
  )
    return 'UNIVERSITY_EXTENSION';
  if (
    candidates.includes('research') ||
    candidates.includes('journal') ||
    candidates.includes('ncbi') ||
    candidates.includes('pubmed')
  )
    return 'RESEARCH_PAPER';
  // Default: treat unknown agricultural sources as research papers
  return 'RESEARCH_PAPER';
}

// ── Database helpers ──────────────────────────────────────────────────────────

async function seedDiscoveryQueue(pool: Pool): Promise<void> {
  const pairs = CROPS.flatMap((crop) => REGIONS.map((region) => ({ crop, region })));

  // Batch insert all combinations — ON CONFLICT DO NOTHING makes this idempotent
  const values = pairs
    .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
    .join(', ');
  const params = pairs.flatMap(({ crop, region }) => [crop, region]);

  await pool.query(
    `INSERT INTO "CropRegionDiscovery" (crop, region)
     VALUES ${values}
     ON CONFLICT (crop, region) DO NOTHING`,
    params,
  );
}

async function resetStaleDiscoveries(pool: Pool): Promise<void> {
  await pool.query(
    `UPDATE "CropRegionDiscovery"
     SET status = 'pending'
     WHERE status = 'completed'
       AND "lastDiscoveredAt" < NOW() - INTERVAL '${REDISCOVERY_DAYS} days'`,
  );
}

async function claimNextBatch(pool: Pool, batchSize: number): Promise<DiscoveryRow[]> {
  // SKIP LOCKED ensures two concurrent Lambda invocations don't process the same rows
  const result = await pool.query<DiscoveryRow>(
    `UPDATE "CropRegionDiscovery"
     SET status = 'running'
     WHERE id IN (
       SELECT id FROM "CropRegionDiscovery"
       WHERE status IN ('pending', 'error')
       ORDER BY "lastDiscoveredAt" ASC NULLS FIRST
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, crop, region`,
    [batchSize],
  );
  return result.rows;
}

async function registerSource(
  pool: Pool,
  crop: string,
  region: string,
  source: DiscoveredSource,
): Promise<string | null> {
  const tags = JSON.stringify([crop, region, 'auto-discovered']);
  try {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO "Source" (
         id, title, url, "sourceType", status, "chunksCount",
         priority, "freshnessHours", tags, "createdAt", "updatedAt"
       )
       VALUES (gen_random_uuid(), $1, $2, $3, 'pending', 0, 'medium', 168, $4::jsonb, NOW(), NOW())
       ON CONFLICT (url) DO UPDATE SET
         title       = EXCLUDED.title,
         status      = 'pending',
         tags        = EXCLUDED.tags,
         "updatedAt" = NOW()
       RETURNING id`,
      [source.title || `${crop} - ${region}`, source.url, source.sourceType, tags],
    );
    return result.rows[0]?.id ?? null;
  } catch (err) {
    console.warn(`[Discovery] Failed to register ${source.url}:`, (err as Error).message);
    return null;
  }
}

async function markCombination(
  pool: Pool,
  id: string,
  status: 'completed' | 'error',
  sourcesFound: number,
): Promise<void> {
  await pool.query(
    `UPDATE "CropRegionDiscovery"
     SET status = $1, "sourcesFound" = $2, "lastDiscoveredAt" = NOW()
     WHERE id = $3`,
    [status, sourcesFound, id],
  );
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const handler: EventBridgeHandler<
  'crop-copilot.discovery.scheduled',
  Record<string, unknown>,
  void
> = async () => {
  const batchSize = Number(process.env.DISCOVERY_BATCH_SIZE ?? 10);
  const pool = getPool();
  const queue = getIngestionQueue();

  // Step 1: Seed all combinations (idempotent)
  await seedDiscoveryQueue(pool);

  // Step 2: Re-queue stale combinations that are due for rediscovery
  await resetStaleDiscoveries(pool);

  // Step 3: Claim next batch of pending combinations
  const batch = await claimNextBatch(pool, batchSize);

  if (batch.length === 0) {
    console.log('[Discovery] All crop × region combinations are up to date — nothing to process');
    return;
  }

  console.log(`[Discovery] Processing ${batch.length} combinations`);

  for (const { id, crop, region } of batch) {
    console.log(`[Discovery] Searching: ${crop} × ${region}`);
    let sourcesFound = 0;

    try {
      const discovered = await searchWithGemini(crop, region);

      for (const source of discovered) {
        const sourceId = await registerSource(pool, crop, region, source);
        if (!sourceId) continue;

        // Immediately enqueue for scraping
        try {
          await queue.publishIngestionBatch({
            messageType: 'ingestion.batch.requested',
            messageVersion: '1',
            requestedAt: new Date().toISOString(),
            sources: [
              {
                sourceId,
                url: source.url,
                priority: 'medium',
                freshnessHours: 168,
                tags: [crop, region, 'auto-discovered'],
              },
            ],
          });
          sourcesFound++;
        } catch (queueErr) {
          console.warn(
            `[Discovery] Failed to enqueue ${source.url}:`,
            (queueErr as Error).message,
          );
          // Source is registered in DB; ingestion scheduler will pick it up next cycle
          sourcesFound++;
        }
      }

      await markCombination(pool, id, 'completed', sourcesFound);
      console.log(`[Discovery] ${crop} × ${region}: ${sourcesFound} sources registered`);
    } catch (error) {
      console.error(
        `[Discovery] Failed for ${crop} × ${region}:`,
        (error as Error).message,
      );
      await markCombination(pool, id, 'error', 0);
    }
  }
};
