/*
  Warnings:

  - A unique constraint covering the columns `[contentHash]` on the table `ImageChunk` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[contentHash]` on the table `TextChunk` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ImageChunk" ADD COLUMN     "contentHash" TEXT;

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "TextChunk" ADD COLUMN     "chunkIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contentHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ImageChunk_contentHash_key" ON "ImageChunk"("contentHash");

-- CreateIndex
CREATE INDEX "ImageChunk_sourceId_idx" ON "ImageChunk"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TextChunk_contentHash_key" ON "TextChunk"("contentHash");

-- CreateIndex
CREATE INDEX "TextChunk_sourceId_idx" ON "TextChunk"("sourceId");
