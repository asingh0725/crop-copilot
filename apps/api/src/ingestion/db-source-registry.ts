/**
 * PostgreSQL-backed source registry.
 *
 * Replaces InMemorySourceRegistry in production environments where
 * DATABASE_URL is set. Sources are read from the "Source" table (which
 * stores freshnessHours, priority, tags, lastScrapedAt after migration 004).
 *
 * The registry determines which sources are "due" by comparing
 * lastScrapedAt against the configured freshnessHours threshold.
 */

import type { Pool } from 'pg';
import type { IngestionSourceDescriptor, IngestionSourcePriority } from '@crop-copilot/contracts';
import type { SourceRegistry } from './source-registry';

interface SourceRow {
  id: string;
  url: string;
  priority: IngestionSourcePriority;
  freshness_hours: number;
  tags: unknown;
}

export class DbSourceRegistry implements SourceRegistry {
  constructor(private readonly pool: Pool) {}

  async listDueSources(now: Date): Promise<IngestionSourceDescriptor[]> {
    const result = await this.pool.query<SourceRow>(
      `
        SELECT
          id,
          url,
          priority,
          "freshnessHours"                        AS freshness_hours,
          COALESCE(tags, '[]'::jsonb)             AS tags
        FROM "Source"
        WHERE status NOT IN ('archived')
          AND url IS NOT NULL
          AND (
            "lastScrapedAt" IS NULL
            OR "lastScrapedAt" < $1::timestamptz - make_interval(hours => "freshnessHours")
          )
        ORDER BY
          CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
          "lastScrapedAt" ASC NULLS FIRST
        LIMIT 100
      `,
      [now.toISOString()],
    );

    return result.rows.map((row) => ({
      sourceId: row.id,
      url: row.url,
      priority: normalizePriority(row.priority),
      freshnessHours: Number(row.freshness_hours) || 168,
      tags: parseTags(row.tags),
    }));
  }

  async markSourceProcessed(sourceId: string, processedAt: Date): Promise<void> {
    await this.pool.query(
      `UPDATE "Source" SET "lastScrapedAt" = $1, "updatedAt" = NOW() WHERE id = $2`,
      [processedAt.toISOString(), sourceId],
    );
  }
}

function normalizePriority(raw: unknown): IngestionSourcePriority {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return 'medium';
}

function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === 'string');
}
