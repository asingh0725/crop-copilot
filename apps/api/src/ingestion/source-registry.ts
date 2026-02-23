import type {
  IngestionSourceDescriptor,
  IngestionSourcePriority,
} from '@crop-copilot/contracts';

const PRIORITY_ORDER: Record<IngestionSourcePriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const DEFAULT_SOURCES: IngestionSourceDescriptor[] = [
  {
    sourceId: 'uc-extension-tomato-disease',
    url: 'https://example.edu/extension/tomato-disease-management',
    priority: 'high',
    freshnessHours: 24,
    tags: ['tomato', 'disease'],
  },
  {
    sourceId: 'usda-crop-advisory',
    url: 'https://example.gov/crop-advisory',
    priority: 'high',
    freshnessHours: 12,
    tags: ['advisory', 'alerts'],
  },
  {
    sourceId: 'state-fertilizer-guide',
    url: 'https://example.gov/fertilizer-guide',
    priority: 'medium',
    freshnessHours: 72,
    tags: ['nutrients'],
  },
  {
    sourceId: 'retailer-product-blog',
    url: 'https://example.com/blog/fungicide-guide',
    priority: 'low',
    freshnessHours: 168,
    tags: ['products'],
  },
];

export interface SourceRegistry {
  listDueSources(now: Date): Promise<IngestionSourceDescriptor[]>;
  markSourceProcessed(sourceId: string, processedAt: Date): Promise<void>;
}

export class InMemorySourceRegistry implements SourceRegistry {
  private readonly sourceById = new Map<string, IngestionSourceDescriptor>();
  private readonly lastProcessedById = new Map<string, Date>();

  constructor(seedSources: IngestionSourceDescriptor[] = DEFAULT_SOURCES) {
    for (const source of seedSources) {
      this.sourceById.set(source.sourceId, source);
    }
  }

  async listDueSources(now: Date): Promise<IngestionSourceDescriptor[]> {
    const due: IngestionSourceDescriptor[] = [];

    for (const source of this.sourceById.values()) {
      const lastProcessed = this.lastProcessedById.get(source.sourceId);
      if (!lastProcessed) {
        due.push(source);
        continue;
      }

      const elapsedHours = (now.getTime() - lastProcessed.getTime()) / (1000 * 60 * 60);
      if (elapsedHours >= source.freshnessHours) {
        due.push(source);
      }
    }

    return due.sort((a, b) => {
      const priorityDelta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return a.sourceId.localeCompare(b.sourceId);
    });
  }

  async markSourceProcessed(sourceId: string, processedAt: Date): Promise<void> {
    if (!this.sourceById.has(sourceId)) {
      return;
    }

    this.lastProcessedById.set(sourceId, processedAt);
  }
}

let sharedRegistry: SourceRegistry | null = null;

export function getSourceRegistry(): SourceRegistry {
  if (!sharedRegistry) {
    sharedRegistry = new InMemorySourceRegistry();
  }

  return sharedRegistry;
}

export function setSourceRegistry(registry: SourceRegistry | null): void {
  sharedRegistry = registry;
}
