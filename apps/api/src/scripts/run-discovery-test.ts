#!/usr/bin/env tsx
/**
 * Manual test runner for the crop × region discovery worker.
 * Applies migration 006, seeds the queue, runs one batch of 3 combinations,
 * and prints results. Safe to re-run (all operations are idempotent).
 *
 * Usage:
 *   DATABASE_URL=... GOOGLE_AI_API_KEY=... tsx src/scripts/run-discovery-test.ts
 */

import { Pool } from 'pg';
import { resolvePoolSslConfig, sanitizeDatabaseUrlForPool } from '../lib/store';
import { CROPS, REGIONS } from '../ingestion/discovery-seeds';

const DATABASE_URL = process.env.DATABASE_URL;
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is required');
  process.exit(1);
}
if (!GOOGLE_AI_API_KEY) {
  console.error('ERROR: GOOGLE_AI_API_KEY is required');
  process.exit(1);
}

function inferSourceType(url: string, title: string = ''): 'GOVERNMENT' | 'UNIVERSITY_EXTENSION' | 'RESEARCH_PAPER' {
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

async function searchWithGemini(crop: string, region: string) {
  const prompt =
    `Find 5-8 authoritative web URLs about ${crop} crop cultivation, disease management, ` +
    `and pest control specifically in ${region}. ` +
    `Prioritize university extension services (.edu), government agricultural agencies (.gov), ` +
    `and peer-reviewed research institutions. ` +
    `Exclude news sites, retailers, social media, and Wikipedia.`;

  const response = await fetch(`${GEMINI_URL}?key=${GOOGLE_AI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API ${response.status}: ${err.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      };
    }>;
  };

  const chunks = payload.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const results: Array<{ url: string; title: string; sourceType: string }> = [];

  for (const chunk of chunks) {
    const uri = chunk.web?.uri?.trim();
    const title = chunk.web?.title?.trim() ?? '';
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    try { new URL(uri); } catch { continue; }
    results.push({ url: uri, title, sourceType: inferSourceType(uri, title) });
    if (results.length >= 8) break;
  }

  return results;
}

async function main() {
  const pool = new Pool({
    connectionString: sanitizeDatabaseUrlForPool(DATABASE_URL!),
    ssl: resolvePoolSslConfig(),
  });

  try {
    // ── Step 1: Apply migration 006 ─────────────────────────────────────────
    console.log('\n── Applying migration 006...');

    // Only patch MLModelVersion if the table already exists
    const mlTableExists = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_name = 'MLModelVersion'
       ) AS exists`,
    );
    if (mlTableExists.rows[0]?.exists) {
      await pool.query(`ALTER TABLE "MLModelVersion" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ`);
      console.log('  ✓ MLModelVersion.updatedAt column ensured');
    } else {
      console.log('  ℹ MLModelVersion table not present — skipping column patch');
    }

    // Add tags/priority/freshnessHours to Source if not present
    await pool.query(`ALTER TABLE "Source" ADD COLUMN IF NOT EXISTS tags JSONB`);
    await pool.query(`ALTER TABLE "Source" ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium'`);
    await pool.query(`ALTER TABLE "Source" ADD COLUMN IF NOT EXISTS "freshnessHours" INT DEFAULT 168`);
    console.log('  ✓ Source table columns ensured (tags, priority, freshnessHours)');

    // Create CropRegionDiscovery table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "CropRegionDiscovery" (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        crop                TEXT        NOT NULL,
        region              TEXT        NOT NULL,
        status              TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending','running','completed','error')),
        "sourcesFound"      INT         NOT NULL DEFAULT 0,
        "lastDiscoveredAt"  TIMESTAMPTZ,
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (crop, region)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_crop_region_discovery_pending
        ON "CropRegionDiscovery" (status, "lastDiscoveredAt" ASC NULLS FIRST)
        WHERE status IN ('pending','error')
    `);
    console.log('  ✓ Migration 006 applied');

    // ── Step 2: Seed discovery queue ────────────────────────────────────────
    console.log('\n── Seeding crop × region combinations...');
    const pairs = CROPS.flatMap((crop) => REGIONS.map((region) => ({ crop, region })));
    const values = pairs.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
    const params = pairs.flatMap(({ crop, region }) => [crop, region]);
    const seedResult = await pool.query(
      `INSERT INTO "CropRegionDiscovery" (crop, region) VALUES ${values}
       ON CONFLICT (crop, region) DO NOTHING`,
      params,
    );
    console.log(`  ✓ ${seedResult.rowCount} new combinations inserted (${pairs.length} total)`);

    // ── Step 3: Claim 3 combinations for this test run ──────────────────────
    console.log('\n── Claiming 3 pending combinations...');
    const claimed = await pool.query<{ id: string; crop: string; region: string }>(
      `UPDATE "CropRegionDiscovery"
       SET status = 'running'
       WHERE id IN (
         SELECT id FROM "CropRegionDiscovery"
         WHERE status IN ('pending','error')
         ORDER BY "lastDiscoveredAt" ASC NULLS FIRST
         LIMIT 3
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, crop, region`,
    );
    console.log(`  ✓ Claimed: ${claimed.rows.map((r) => `${r.crop} × ${r.region}`).join(', ')}`);

    // ── Step 4: Run Gemini discovery for each combination ───────────────────
    for (const { id, crop, region } of claimed.rows) {
      console.log(`\n── Searching Gemini: ${crop} × ${region}`);
      let sourcesFound = 0;

      try {
        const discovered = await searchWithGemini(crop, region);
        console.log(`  Found ${discovered.length} URLs:`);

        for (const source of discovered) {
          console.log(`    [${source.sourceType}] ${source.title}`);
          console.log(`      ${source.url}`);

          // Register source in DB
          const tags = JSON.stringify([crop, region, 'auto-discovered']);
          const insertResult = await pool.query<{ id: string }>(
            `INSERT INTO "Source" (
               id, title, url, "sourceType", status, "chunksCount",
               priority, "freshnessHours", tags, "createdAt", "updatedAt"
             )
             VALUES (gen_random_uuid(), $1, $2, $3, 'pending', 0, 'medium', 168, $4::jsonb, NOW(), NOW())
             ON CONFLICT (url) DO UPDATE SET
               title = EXCLUDED.title, status = 'pending',
               tags = EXCLUDED.tags, "updatedAt" = NOW()
             RETURNING id`,
            [source.title || `${crop} - ${region}`, source.url, source.sourceType, tags],
          );
          if (insertResult.rows[0]?.id) sourcesFound++;
        }

        await pool.query(
          `UPDATE "CropRegionDiscovery"
           SET status = 'completed', "sourcesFound" = $1, "lastDiscoveredAt" = NOW()
           WHERE id = $2`,
          [sourcesFound, id],
        );
        console.log(`  ✓ ${sourcesFound} sources registered → status: completed`);
      } catch (err) {
        console.error(`  ✗ Error: ${(err as Error).message}`);
        await pool.query(
          `UPDATE "CropRegionDiscovery" SET status = 'error' WHERE id = $1`,
          [id],
        );
      }
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    const stats = await pool.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count FROM "CropRegionDiscovery" GROUP BY status ORDER BY status`,
    );
    console.log('\n── Discovery queue status:');
    for (const row of stats.rows) {
      console.log(`  ${row.status}: ${row.count}`);
    }

    const sourceCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM "Source" WHERE tags @> '["auto-discovered"]'::jsonb`,
    );
    console.log(`\n── Total auto-discovered sources in DB: ${sourceCount.rows[0]?.count ?? 0}`);
    console.log('\n✓ Test run complete.\n');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
