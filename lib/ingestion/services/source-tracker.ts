import { prisma } from "@/lib/prisma";
import { Prisma, SourceType } from "@prisma/client";

export interface RegisterSourceInput {
  title: string;
  url?: string;
  sourceType: SourceType;
  institution?: string;
}

export type SourceWithChunks = Prisma.SourceGetPayload<{
  include: {
    textChunks: { select: { id: true } };
    imageChunks: { select: { id: true } };
  };
}>;

export interface IngestionStats {
  textChunks: number;
  imageChunks: number;
}

export interface IngestionSummary {
  total: number;
  byStatus: {
    pending: number;
    completed: number;
    failed: number;
  };
  byType: Record<string, number>;
  totalChunks: {
    text: number;
    images: number;
  };
}

/**
 * Register a new source or return existing source if URL already exists
 * This prevents duplicate ingestion of the same source
 *
 * @param input - Source registration data
 * @returns Source record
 */
export async function registerSource(
  input: RegisterSourceInput
): Promise<{ source: SourceWithChunks; created: boolean }> {
  // If URL is provided, try to find existing source
  if (input.url) {
    const existing = await prisma.source.findUnique({
      where: { url: input.url },
      include: {
        textChunks: { select: { id: true } },
        imageChunks: { select: { id: true } },
      },
    });

    if (existing) {
      console.log(`Source already exists: ${existing.title} (${existing.id})`);
      return { source: existing, created: false };
    }
  }

  // Create new source
  const source = await prisma.source.create({
    data: {
      title: input.title,
      url: input.url,
      sourceType: input.sourceType,
      institution: input.institution,
      status: "pending",
    },
    include: {
      textChunks: { select: { id: true } },
      imageChunks: { select: { id: true } },
    },
  });

  console.log(`Registered new source: ${source.title} (${source.id})`);

  return { source, created: true };
}

/**
 * Get source by URL with all chunks
 *
 * @param url - Source URL
 * @returns Source with chunks or null if not found
 */
export async function getSourceByUrl(
  url: string
): Promise<SourceWithChunks | null> {
  return await prisma.source.findUnique({
    where: { url },
    include: {
      textChunks: { select: { id: true } },
      imageChunks: { select: { id: true } },
    },
  });
}

/**
 * Mark source as completed with ingestion statistics
 *
 * @param sourceId - Source ID
 * @param stats - Ingestion statistics
 */
export async function markSourceAsCompleted(
  sourceId: string,
  stats: IngestionStats
): Promise<void> {
  const totalChunks = stats.textChunks + stats.imageChunks;

  await prisma.source.update({
    where: { id: sourceId },
    data: {
      status: "completed",
      chunksCount: totalChunks,
      errorMessage: null,
    },
  });

  console.log(
    `Source ${sourceId} marked as completed (${stats.textChunks} text, ${stats.imageChunks} images)`
  );
}

/**
 * Mark source as failed with error message
 *
 * @param sourceId - Source ID
 * @param error - Error message or Error object
 */
export async function markSourceAsFailed(
  sourceId: string,
  error: string | Error
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : error;

  await prisma.source.update({
    where: { id: sourceId },
    data: {
      status: "failed",
      errorMessage,
    },
  });

  console.error(`Source ${sourceId} marked as failed: ${errorMessage}`);
}

/**
 * Get sources by status
 *
 * @param status - Status to filter by
 * @returns Array of sources matching the status
 */
export async function getSourcesByStatus(
  status: "pending" | "completed" | "failed"
): Promise<SourceWithChunks[]> {
  return await prisma.source.findMany({
    where: { status },
    include: {
      textChunks: { select: { id: true } },
      imageChunks: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get ingestion statistics across all sources
 *
 * @returns Summary of ingestion statistics
 */
export async function getIngestionStats(): Promise<IngestionSummary> {
  const allSources = await prisma.source.findMany({
    include: {
      textChunks: { select: { id: true } },
      imageChunks: { select: { id: true } },
    },
  });

  const summary: IngestionSummary = {
    total: allSources.length,
    byStatus: {
      pending: 0,
      completed: 0,
      failed: 0,
    },
    byType: {},
    totalChunks: {
      text: 0,
      images: 0,
    },
  };

  for (const source of allSources) {
    // Count by status
    if (source.status === "pending") summary.byStatus.pending++;
    else if (source.status === "completed") summary.byStatus.completed++;
    else if (source.status === "failed") summary.byStatus.failed++;

    // Count by type
    const type = source.sourceType;
    summary.byType[type] = (summary.byType[type] || 0) + 1;

    // Count chunks
    summary.totalChunks.text += source.textChunks.length;
    summary.totalChunks.images += source.imageChunks.length;
  }

  return summary;
}

/**
 * Reset failed sources to pending status for retry
 *
 * @returns Number of sources reset
 */
export async function resetFailedSources(): Promise<number> {
  const result = await prisma.source.updateMany({
    where: { status: "failed" },
    data: {
      status: "pending",
      errorMessage: null,
    },
  });

  console.log(`Reset ${result.count} failed sources to pending`);

  return result.count;
}

/**
 * Delete a source and all its associated chunks
 *
 * @param sourceId - Source ID to delete
 */
export async function deleteSource(sourceId: string): Promise<void> {
  await prisma.source.delete({
    where: { id: sourceId },
  });

  console.log(`Deleted source ${sourceId} and all associated chunks`);
}

/**
 * Get detailed source information by ID
 *
 * @param sourceId - Source ID
 * @returns Source with full chunk details or null if not found
 */
export async function getSourceById(
  sourceId: string
): Promise<SourceWithChunks | null> {
  return await prisma.source.findUnique({
    where: { id: sourceId },
    include: {
      textChunks: { select: { id: true } },
      imageChunks: { select: { id: true } },
    },
  });
}

/**
 * Update source chunks count based on actual database counts
 * Useful for fixing inconsistencies
 *
 * @param sourceId - Source ID
 */
export async function syncSourceChunksCount(sourceId: string): Promise<void> {
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: {
      textChunks: { select: { id: true } },
      imageChunks: { select: { id: true } },
    },
  });

  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  const actualCount = source.textChunks.length + source.imageChunks.length;

  await prisma.source.update({
    where: { id: sourceId },
    data: { chunksCount: actualCount },
  });

  console.log(`Synced chunks count for source ${sourceId}: ${actualCount}`);
}
