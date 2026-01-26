import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { SourceType } from "@prisma/client";
import type { ChunkData, ImageData, ProcessedImage, ScrapedDocument } from "../scrapers/types";

/**
 * Generate MD5 hash for content
 */
export function generateHash(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}

/**
 * Upsert sources to database
 * Returns a map of URL → sourceId
 */
export async function upsertSources(
  documents: ScrapedDocument[]
): Promise<Map<string, string>> {
  console.log(`\n📚 Upserting ${documents.length} sources to database...`);

  const urlToIdMap = new Map<string, string>();

  for (const doc of documents) {
    try {
      // Prepare metadata
      const metadata = {
        institution: doc.metadata.institution,
        publishDate: doc.metadata.publishDate,
        crops: doc.metadata.crops || [],
        topics: doc.metadata.topics || [],
        region: doc.metadata.region,
      };

      // Upsert source (unique by URL)
      const source = await prisma.source.upsert({
        where: { url: doc.url },
        create: {
          title: doc.title,
          url: doc.url,
          sourceType: doc.sourceType,
          institution: doc.metadata.institution,
          status: "processed",
          chunksCount: 0, // Will be updated when chunks are added
          metadata,
        },
        update: {
          title: doc.title,
          institution: doc.metadata.institution,
          status: "processed",
          metadata,
        },
      });

      urlToIdMap.set(doc.url, source.id);
    } catch (error) {
      console.error(`  ✗ Failed to upsert source ${doc.url}:`, error);
    }
  }

  console.log(`✅ Sources upserted: ${urlToIdMap.size}`);

  return urlToIdMap;
}

/**
 * Upsert text chunks to database with deduplication
 */
export async function upsertTextChunks(
  chunks: Array<ChunkData & { embedding: number[] }>,
  batchSize = 50
): Promise<{ inserted: number; skipped: number; updated: number }> {
  console.log(`\n📦 Upserting ${chunks.length} text chunks to database...`);

  let inserted = 0;
  let skipped = 0;
  let updated = 0;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(chunks.length / batchSize);

    console.log(`   Batch ${batchNum}/${totalBatches} (${batch.length} chunks)...`);

    try {
      for (const chunk of batch) {
        // Generate content hash for deduplication
        const hash = generateHash(
          `${chunk.content}${chunk.sourceId}${chunk.chunkIndex}`
        );

        // Convert embedding array to Prisma-compatible format
        const embeddingString = `[${chunk.embedding.join(",")}]`;

        try {
          // Check if exists
          const existing = await prisma.textChunk.findUnique({
            where: { contentHash: hash },
          });

          if (existing) {
            skipped++;
          } else {
            // Insert new chunk
            await prisma.$executeRaw`
              INSERT INTO "TextChunk"
                ("id", "contentHash", "sourceId", "content", "embedding", "chunkIndex", "metadata", "createdAt")
              VALUES
                (gen_random_uuid()::text, ${hash}, ${chunk.sourceId}, ${chunk.content},
                 ${embeddingString}::vector(1536), ${chunk.chunkIndex}, ${JSON.stringify(chunk.metadata)}::jsonb, NOW())
            `;
            inserted++;
          }
        } catch (error: any) {
          // Handle unique constraint violations
          if (error?.code === "23505") {
            skipped++;
          } else {
            console.error(`    ✗ Failed to insert chunk:`, error);
          }
        }
      }

      console.log(`   ✓ Batch complete: +${inserted}, ~${skipped} skipped`);
    } catch (error) {
      console.error(`   ✗ Batch ${batchNum} failed:`, error);
    }
  }

  // Update source chunk counts
  console.log(`\n📊 Updating source chunk counts...`);
  await updateSourceChunkCounts();

  console.log(`✅ Text chunks upserted: ${inserted} inserted, ${skipped} skipped`);

  return { inserted, skipped, updated };
}

/**
 * Upsert image chunks to database with deduplication
 */
export async function upsertImageChunks(
  images: Array<ImageData & { embedding: number[] }>,
  batchSize = 20
): Promise<{ inserted: number; updated: number; skipped: number }> {
  console.log(`\n🖼️  Upserting ${images.length} image chunks to database...`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(images.length / batchSize);

    console.log(`   Batch ${batchNum}/${totalBatches} (${batch.length} images)...`);

    try {
      for (const image of batch) {
        const embeddingString = `[${image.embedding.join(",")}]`;

        try {
          // Check if exists by URL
          const existing = await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "ImageChunk"
            WHERE "imageUrl" = ${image.imageUrl}
            AND "sourceId" = ${image.sourceId}
            LIMIT 1
          `;

          if (existing.length > 0) {
            // Update existing
            await prisma.$executeRaw`
              UPDATE "ImageChunk"
              SET 
                "altText" = ${image.altText},
                "embedding" = ${embeddingString}::vector,
                "contextChunkId" = ${image.contextChunkId},
                "metadata" = ${JSON.stringify(image.metadata)}::jsonb
              WHERE id = ${existing[0].id}
            `;
            updated++;
          } else {
            // Insert new
            await prisma.$executeRaw`
              INSERT INTO "ImageChunk" (
                id, "sourceId", "imageUrl", "altText", embedding, 
                "contextChunkId", metadata, "createdAt"
              )
              VALUES (
                ${image.id},
                ${image.sourceId},
                ${image.imageUrl},
                ${image.altText},
                ${embeddingString}::vector,
                ${image.contextChunkId},
                ${JSON.stringify(image.metadata)}::jsonb,
                NOW()
              )
            `;
            inserted++;
          }
        } catch (error: any) {
          if (error?.code === "23505") {
            skipped++;
          } else {
            console.warn(`⚠️  Failed to upsert image ${image.id}: ${error.message}`);
            skipped++;
          }
        }
      }

      if ((inserted + updated + skipped) % 50 === 0) {
        console.log(`   Progress: ${inserted + updated + skipped}/${images.length}`);
      }
    } catch (error) {
      console.error(`   ✗ Batch ${batchNum} failed:`, error);
    }
  }

  console.log(`\n✅ Image upsert complete:`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);

  return { inserted, updated, skipped };
}

/**
 * Update chunksCount for all sources
 */
async function updateSourceChunkCounts(): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE "Source" s
      SET "chunksCount" = (
        SELECT COUNT(*)
        FROM "TextChunk" t
        WHERE t."sourceId" = s.id
      ) + (
        SELECT COUNT(*)
        FROM "ImageChunk" i
        WHERE i."sourceId" = s.id
      )
    `;

    console.log(`✓ Source chunk counts updated`);
  } catch (error) {
    console.error(`Failed to update source chunk counts:`, error);
  }
}
