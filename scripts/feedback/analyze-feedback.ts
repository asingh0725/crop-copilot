/**
 * Weekly Feedback Analysis Script
 *
 * This script analyzes feedback data to:
 * - Identify recurring problems (chunks with poor ratings)
 * - Identify successful content (chunks with good outcomes)
 * - Track product recommendation success rates
 * - Flag chunks for expert review
 * - Generate improvement suggestions
 *
 * Run with: npx tsx scripts/feedback/analyze-feedback.ts
 */

import { prisma } from "@/lib/prisma";

interface ChunkPerformance {
  chunkId: string;
  sourceTitle: string;
  usageCount: number;
  averageRating: number;
  successRate: number;
  issues: string[];
}

interface ProductPerformance {
  productId: string;
  productName: string;
  diagnosisType: string;
  cropType: string;
  usageCount: number;
  successRate: number;
}

interface AnalysisReport {
  period: { start: Date; end: Date };
  totalFeedback: number;
  totalWithRatings: number;
  totalWithOutcomes: number;
  averageRating: number;
  averageAccuracy: number;
  helpfulRate: number;
  outcomeSuccessRate: number;
  topIssues: { issue: string; count: number }[];
  problematicChunks: ChunkPerformance[];
  successfulChunks: ChunkPerformance[];
  productPerformance: ProductPerformance[];
  recommendations: string[];
}

async function analyzeWeeklyFeedback(): Promise<AnalysisReport> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  console.log("\n=== Weekly Feedback Analysis ===");
  console.log(`Period: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  console.log("================================\n");

  // Fetch all feedback from the past week
  const feedbacks = await prisma.feedback.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      recommendation: {
        include: {
          sources: {
            include: {
              textChunk: { include: { source: true } },
              imageChunk: { include: { source: true } },
            },
          },
        },
      },
    },
  });

  console.log(`Total feedback entries: ${feedbacks.length}\n`);

  // Basic metrics
  const withRatings = feedbacks.filter((f) => f.rating !== null);
  const withOutcomes = feedbacks.filter((f) => f.outcomeReported);
  const helpful = feedbacks.filter((f) => f.helpful === true);
  const successfulOutcomes = feedbacks.filter((f) => f.outcomeSuccess === true);

  const averageRating =
    withRatings.length > 0
      ? withRatings.reduce((sum, f) => sum + (f.rating || 0), 0) /
        withRatings.length
      : 0;

  const averageAccuracy =
    withRatings.filter((f) => f.accuracy !== null).length > 0
      ? withRatings
          .filter((f) => f.accuracy !== null)
          .reduce((sum, f) => sum + (f.accuracy || 0), 0) /
        withRatings.filter((f) => f.accuracy !== null).length
      : 0;

  // Issue analysis
  const issueCount: Record<string, number> = {};
  feedbacks.forEach((f) => {
    if (f.issues && Array.isArray(f.issues)) {
      (f.issues as string[]).forEach((issue) => {
        issueCount[issue] = (issueCount[issue] || 0) + 1;
      });
    }
  });

  const topIssues = Object.entries(issueCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([issue, count]) => ({ issue, count }));

  // Chunk performance analysis
  const chunkStats: Record<
    string,
    {
      sourceTitle: string;
      ratings: number[];
      outcomes: boolean[];
      issues: string[];
    }
  > = {};

  feedbacks.forEach((f) => {
    const chunks = f.retrievedChunks as string[] | null;
    if (chunks && Array.isArray(chunks)) {
      chunks.forEach((chunkId) => {
        if (!chunkStats[chunkId]) {
          // Try to find chunk info from recommendation sources
          const source = f.recommendation.sources.find(
            (s) => s.textChunkId === chunkId || s.imageChunkId === chunkId
          );
          const sourceDoc =
            source?.textChunk?.source || source?.imageChunk?.source;

          chunkStats[chunkId] = {
            sourceTitle: sourceDoc?.title || "Unknown",
            ratings: [],
            outcomes: [],
            issues: [],
          };
        }

        if (f.rating !== null) {
          chunkStats[chunkId].ratings.push(f.rating);
        }
        if (f.outcomeSuccess !== null) {
          chunkStats[chunkId].outcomes.push(f.outcomeSuccess);
        }
        if (f.issues && Array.isArray(f.issues)) {
          chunkStats[chunkId].issues.push(...(f.issues as string[]));
        }
      });
    }
  });

  const chunkPerformances: ChunkPerformance[] = Object.entries(chunkStats)
    .map(([chunkId, stats]) => ({
      chunkId,
      sourceTitle: stats.sourceTitle,
      usageCount: stats.ratings.length + stats.outcomes.length,
      averageRating:
        stats.ratings.length > 0
          ? stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length
          : 0,
      successRate:
        stats.outcomes.length > 0
          ? stats.outcomes.filter(Boolean).length / stats.outcomes.length
          : 0,
      issues: Array.from(new Set(stats.issues)),
    }))
    .filter((c) => c.usageCount >= 3); // Only include chunks with enough data

  // Sort for problematic and successful chunks
  const problematicChunks = [...chunkPerformances]
    .filter((c) => c.averageRating < 3 || c.successRate < 0.5)
    .sort((a, b) => a.averageRating - b.averageRating)
    .slice(0, 10);

  const successfulChunks = [...chunkPerformances]
    .filter((c) => c.averageRating >= 4 && c.successRate >= 0.7)
    .sort((a, b) => b.averageRating - a.averageRating)
    .slice(0, 10);

  // Fetch product performance from database
  const productScores = await prisma.productFeedbackScore.findMany({
    include: {
      product: true,
    },
    orderBy: {
      successRate: "desc",
    },
  });

  const productPerformance: ProductPerformance[] = productScores.map((ps) => ({
    productId: ps.productId,
    productName: ps.product?.name || "Unknown",
    diagnosisType: ps.diagnosisType,
    cropType: ps.cropType,
    usageCount: ps.successCount + ps.failureCount + ps.partialCount,
    successRate: ps.successRate,
  }));

  // Update chunk feedback scores
  await updateChunkScores(chunkPerformances);

  // Generate recommendations
  const recommendations: string[] = [];

  if (averageRating < 3.5) {
    recommendations.push(
      "Overall rating is below target. Review common issues and update prompts."
    );
  }

  if (topIssues.some((i) => i.issue === "diagnosis_wrong" && i.count > 5)) {
    recommendations.push(
      "Multiple users reporting incorrect diagnoses. Consider enhancing diagnostic context or adding more specific knowledge base content."
    );
  }

  if (topIssues.some((i) => i.issue === "products_unavailable" && i.count > 3)) {
    recommendations.push(
      "Product availability issues reported. Update product database with regional availability data."
    );
  }

  if (problematicChunks.length > 5) {
    recommendations.push(
      `${problematicChunks.length} content chunks are performing poorly. Flag for expert review and potential revision.`
    );
  }

  const report: AnalysisReport = {
    period: { start: startDate, end: endDate },
    totalFeedback: feedbacks.length,
    totalWithRatings: withRatings.length,
    totalWithOutcomes: withOutcomes.length,
    averageRating,
    averageAccuracy,
    helpfulRate: feedbacks.length > 0 ? helpful.length / feedbacks.length : 0,
    outcomeSuccessRate:
      withOutcomes.length > 0
        ? successfulOutcomes.length / withOutcomes.length
        : 0,
    topIssues,
    problematicChunks,
    successfulChunks,
    productPerformance,
    recommendations,
  };

  return report;
}

async function updateChunkScores(
  chunkPerformances: ChunkPerformance[]
): Promise<void> {
  console.log("Updating chunk feedback scores...");

  for (const chunk of chunkPerformances) {
    const isPositive = chunk.averageRating >= 4;
    const isNegative = chunk.averageRating <= 2;
    const feedbackScore = isPositive ? 1.0 : isNegative ? 0.0 : 0.5;

    try {
      await prisma.chunkFeedbackScore.upsert({
        where: { chunkId: chunk.chunkId },
        create: {
          chunkId: chunk.chunkId,
          positiveCount: isPositive ? chunk.usageCount : 0,
          negativeCount: isNegative ? chunk.usageCount : 0,
          neutralCount: !isPositive && !isNegative ? chunk.usageCount : 0,
          feedbackScore,
          timesRetrieved: chunk.usageCount,
          lastUsed: new Date(),
        },
        update: {
          feedbackScore,
          timesRetrieved: chunk.usageCount,
          lastUsed: new Date(),
        },
      });
    } catch (error) {
      console.error(`Error updating chunk score for ${chunk.chunkId}:`, error);
    }
  }

  console.log(`Updated ${chunkPerformances.length} chunk scores.\n`);
}

function printReport(report: AnalysisReport): void {
  console.log("\n" + "=".repeat(60));
  console.log("WEEKLY FEEDBACK ANALYSIS REPORT");
  console.log("=".repeat(60));

  console.log("\n📊 OVERVIEW");
  console.log("-".repeat(40));
  console.log(
    `Period: ${report.period.start.toDateString()} - ${report.period.end.toDateString()}`
  );
  console.log(`Total Feedback: ${report.totalFeedback}`);
  console.log(`With Ratings: ${report.totalWithRatings}`);
  console.log(`With Outcomes: ${report.totalWithOutcomes}`);

  console.log("\n📈 KEY METRICS");
  console.log("-".repeat(40));
  console.log(`Average Rating: ${report.averageRating.toFixed(2)}/5`);
  console.log(`Average Accuracy: ${report.averageAccuracy.toFixed(2)}/5`);
  console.log(`Helpful Rate: ${(report.helpfulRate * 100).toFixed(1)}%`);
  console.log(
    `Outcome Success Rate: ${(report.outcomeSuccessRate * 100).toFixed(1)}%`
  );

  if (report.topIssues.length > 0) {
    console.log("\n⚠️ TOP ISSUES");
    console.log("-".repeat(40));
    report.topIssues.forEach((issue, i) => {
      console.log(
        `${i + 1}. ${issue.issue.replace(/_/g, " ")} (${issue.count})`
      );
    });
  }

  if (report.problematicChunks.length > 0) {
    console.log("\n🔴 PROBLEMATIC CONTENT (Needs Review)");
    console.log("-".repeat(40));
    report.problematicChunks.forEach((chunk) => {
      console.log(`• ${chunk.sourceTitle} (${chunk.chunkId.slice(0, 8)}...)`);
      console.log(
        `  Rating: ${chunk.averageRating.toFixed(1)}/5 | Success: ${(chunk.successRate * 100).toFixed(0)}% | Uses: ${chunk.usageCount}`
      );
      if (chunk.issues.length > 0) {
        console.log(`  Issues: ${chunk.issues.join(", ")}`);
      }
    });
  }

  if (report.successfulChunks.length > 0) {
    console.log("\n🟢 TOP PERFORMING CONTENT");
    console.log("-".repeat(40));
    report.successfulChunks.slice(0, 5).forEach((chunk) => {
      console.log(`• ${chunk.sourceTitle} (${chunk.chunkId.slice(0, 8)}...)`);
      console.log(
        `  Rating: ${chunk.averageRating.toFixed(1)}/5 | Success: ${(chunk.successRate * 100).toFixed(0)}% | Uses: ${chunk.usageCount}`
      );
    });
  }

  if (report.productPerformance.length > 0) {
    console.log("\n💊 PRODUCT PERFORMANCE");
    console.log("-".repeat(40));
    report.productPerformance.slice(0, 10).forEach((product) => {
      const status =
        product.successRate >= 0.7
          ? "✅"
          : product.successRate >= 0.5
            ? "⚠️"
            : "❌";
      console.log(
        `${status} ${product.productName} (${product.diagnosisType}/${product.cropType}): ${(product.successRate * 100).toFixed(0)}% success (${product.usageCount} uses)`
      );
    });
  }

  if (report.recommendations.length > 0) {
    console.log("\n💡 RECOMMENDATIONS");
    console.log("-".repeat(40));
    report.recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`);
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log("END OF REPORT");
  console.log("=".repeat(60) + "\n");
}

async function main() {
  try {
    const report = await analyzeWeeklyFeedback();
    printReport(report);

    // Optionally save report to file
    const reportPath = `./reports/feedback-${new Date().toISOString().split("T")[0]}.json`;

    // Create reports directory if it doesn't exist
    const fs = await import("fs/promises");
    await fs.mkdir("./reports", { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`Full report saved to: ${reportPath}`);
  } catch (error) {
    console.error("Error analyzing feedback:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
