#!/usr/bin/env tsx
import { prisma } from "@/lib/prisma";
import { searchTextChunks } from "@/lib/retrieval/search";

async function verifyKnowledgeBase() {
  console.log("\n🔍 Knowledge Base Verification");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let checksPassedCount = 0;
  let totalChecks = 0;

  // 1. Database counts
  console.log("1️⃣  Database Counts\n");
  totalChecks++;

  try {
    const [sourceCount, textCount, imageCount] = await Promise.all([
      prisma.source.count(),
      prisma.textChunk.count(),
      prisma.imageChunk.count(),
    ]);

    console.log(`   Sources: ${sourceCount.toLocaleString()}`);
    console.log(`   Text Chunks: ${textCount.toLocaleString()}`);
    console.log(`   Image Chunks: ${imageCount.toLocaleString()}`);

    if (sourceCount > 0 && textCount > 0) {
      console.log("   ✅ Database has content\n");
      checksPassedCount++;
    } else {
      console.log("   ⚠️  Database is empty or incomplete\n");
    }
  } catch (error) {
    console.log("   ❌ Failed to query database\n");
  }

  // 2. Check for null embeddings
  console.log("2️⃣  Embedding Integrity\n");
  totalChecks++;

  try {
    // Use raw queries since embedding field is Unsupported type
    const nullTextEmbeddings = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "TextChunk" WHERE embedding IS NULL
    `.then(res => Number(res[0].count));

    const nullImageEmbeddings = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "ImageChunk" WHERE embedding IS NULL
    `.then(res => Number(res[0].count));

    console.log(`   Text chunks with null embeddings: ${nullTextEmbeddings}`);
    console.log(`   Image chunks with null embeddings: ${nullImageEmbeddings}`);

    if (nullTextEmbeddings === 0 && nullImageEmbeddings === 0) {
      console.log("   ✅ All chunks have embeddings\n");
      checksPassedCount++;
    } else {
      console.log("   ⚠️  Some chunks missing embeddings\n");
    }
  } catch (error) {
    console.log("   ❌ Failed to check embeddings\n");
  }

  // 3. Sample embedding dimensions
  console.log("3️⃣  Embedding Dimensions\n");
  totalChecks++;

  try {
    const sampleChunks = await prisma.$queryRaw<
      Array<{ embedding: any }>
    >`SELECT embedding FROM "TextChunk" WHERE embedding IS NOT NULL LIMIT 5`;

    if (sampleChunks.length > 0) {
      // Check if embeddings are arrays with correct length
      const validDimensions = sampleChunks.every((chunk) => {
        if (typeof chunk.embedding === "string") {
          // Parse vector string format: [1,2,3,...]
          const match = chunk.embedding.match(/\[([\d.,\s-]+)\]/);
          if (match) {
            const values = match[1].split(",").map(Number);
            return values.length === 1536;
          }
        }
        return Array.isArray(chunk.embedding) && chunk.embedding.length === 1536;
      });

      if (validDimensions) {
        console.log("   ✅ Embedding dimensions correct (1536)\n");
        checksPassedCount++;
      } else {
        console.log("   ⚠️  Invalid embedding dimensions detected\n");
      }
    } else {
      console.log("   ⚠️  No embeddings found to check\n");
    }
  } catch (error) {
    console.log("   ❌ Failed to verify dimensions:", error);
    console.log("");
  }

  // 4. Test vector search
  console.log("4️⃣  Vector Search Quality\n");
  totalChecks++;

  const testQueries = [
    "nitrogen deficiency in corn",
    "soybean cyst nematode management",
    "wheat disease identification",
    "phosphorus fertilizer recommendations",
    "micronutrient deficiency symptoms",
  ];

  try {
    let totalScore = 0;
    let successfulQueries = 0;

    for (const query of testQueries) {
      try {
        const results = await searchTextChunks(query, 5);

        if (results.length > 0) {
          const avgScore =
            results.reduce((sum, r) => sum + r.similarity, 0) / results.length;
          totalScore += avgScore;
          successfulQueries++;

          console.log(`   "${query.slice(0, 40)}..."`);
          console.log(
            `     Top score: ${results[0]?.similarity.toFixed(3)} | Avg: ${avgScore.toFixed(3)} | Results: ${results.length}`
          );
        }
      } catch (error) {
        console.log(`   "${query.slice(0, 40)}..." - FAILED`);
      }
    }

    console.log("");

    if (successfulQueries > 0) {
      const overallAvg = totalScore / successfulQueries;
      console.log(
        `   Overall avg similarity: ${overallAvg.toFixed(3)}`
      );

      if (overallAvg > 0.7) {
        console.log("   ✅ High relevance search results\n");
        checksPassedCount++;
      } else if (overallAvg > 0.5) {
        console.log("   ⚠️  Moderate relevance search results\n");
        checksPassedCount++;
      } else {
        console.log("   ⚠️  Low relevance search results\n");
      }
    } else {
      console.log("   ❌ All search queries failed\n");
    }
  } catch (error) {
    console.log("   ❌ Vector search test failed:", error);
    console.log("");
  }

  // 5. Coverage analysis
  console.log("5️⃣  Content Coverage\n");
  totalChecks++;

  try {
    const cropCoverage = await prisma.$queryRaw<
      Array<{ crop: string; chunk_count: number }>
    >`
      SELECT
        metadata->>'crops' as crop,
        COUNT(*) as chunk_count
      FROM "TextChunk"
      WHERE metadata->>'crops' IS NOT NULL
      GROUP BY metadata->>'crops'
      ORDER BY chunk_count DESC
      LIMIT 10
    `;

    if (cropCoverage.length > 0) {
      console.log("   Top Crop Coverage:");
      cropCoverage.forEach((row) => {
        console.log(`     ${row.crop}: ${row.chunk_count} chunks`);
      });
      console.log("");

      // Check if major crops are covered
      const hasCorn = cropCoverage.some((r) => r.crop?.includes("corn"));
      const hasSoybeans = cropCoverage.some((r) =>
        r.crop?.includes("soybeans")
      );

      if (hasCorn && hasSoybeans) {
        console.log("   ✅ Major crops covered\n");
        checksPassedCount++;
      } else {
        console.log("   ⚠️  Missing major crop coverage\n");
      }
    } else {
      console.log("   ⚠️  No crop coverage metadata found\n");
    }
  } catch (error) {
    console.log("   ⚠️  Coverage analysis failed:", error);
    console.log("");
  }

  // 6. Source distribution
  console.log("6️⃣  Source Distribution\n");

  try {
    const sourceStats = await prisma.source.findMany({
      select: {
        institution: true,
        chunksCount: true,
        title: true,
      },
      orderBy: { chunksCount: "desc" },
      take: 10,
    });

    if (sourceStats.length > 0) {
      console.log("   Top Sources by Chunk Count:");
      sourceStats.forEach((source) => {
        const title =
          source.title.length > 50
            ? source.title.slice(0, 50) + "..."
            : source.title;
        console.log(
          `     ${title} (${source.institution || "Unknown"}): ${source.chunksCount} chunks`
        );
      });
      console.log("");
    }
  } catch (error) {
    console.log("   ⚠️  Source stats failed\n");
  }

  // Final verdict
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 Verification Summary");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const passRate = Math.round((checksPassedCount / totalChecks) * 100);

  console.log(`   Checks passed: ${checksPassedCount}/${totalChecks} (${passRate}%)`);
  console.log("");

  if (passRate >= 80) {
    console.log("✅ Knowledge base is healthy and ready for use!\n");
    process.exit(0);
  } else if (passRate >= 60) {
    console.log("⚠️  Knowledge base has some issues but is functional\n");
    process.exit(0);
  } else {
    console.log("❌ Knowledge base has significant issues\n");
    process.exit(1);
  }
}

// Run verification
verifyKnowledgeBase().catch((error) => {
  console.error("\n❌ Verification failed:", error);
  process.exit(1);
});
