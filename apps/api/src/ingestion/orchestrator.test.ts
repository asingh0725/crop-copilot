import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIngestionBatchMessage } from './orchestrator';
import { InMemorySourceRegistry } from './source-registry';

test('buildIngestionBatchMessage prioritizes high priority sources', () => {
  const registry = new InMemorySourceRegistry([
    {
      sourceId: 'low-source',
      url: 'https://example.com/low',
      priority: 'low',
      freshnessHours: 24,
      tags: [],
    },
    {
      sourceId: 'high-source',
      url: 'https://example.com/high',
      priority: 'high',
      freshnessHours: 24,
      tags: [],
    },
  ]);

  const batch = buildIngestionBatchMessage(
    {
      trigger: 'scheduled',
      maxSources: 10,
      scheduledAt: '2026-02-16T12:00:00.000Z',
    },
    registry,
    new Date('2026-02-16T12:00:00.000Z')
  );

  assert.ok(batch);
  assert.equal(batch.sources[0].sourceId, 'high-source');
});

test('buildIngestionBatchMessage returns null when no source is due', () => {
  const registry = new InMemorySourceRegistry([
    {
      sourceId: 'high-source',
      url: 'https://example.com/high',
      priority: 'high',
      freshnessHours: 24,
      tags: [],
    },
  ]);
  registry.markSourceProcessed('high-source', new Date('2026-02-16T11:00:00.000Z'));

  const batch = buildIngestionBatchMessage(
    {
      trigger: 'scheduled',
      maxSources: 10,
      scheduledAt: '2026-02-16T12:00:00.000Z',
    },
    registry,
    new Date('2026-02-16T12:00:00.000Z')
  );

  assert.equal(batch, null);
});
