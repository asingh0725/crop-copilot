import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  })
);

const profile = String(args.get("profile") || "baseline");
const isEdge = profile === "edge";

const INPUTS_PATH = isEdge
  ? "data/testing/uat-inputs-edge.json"
  : "data/testing/uat-inputs.json";
const RESULTS_PATH = isEdge
  ? "data/testing/uat-results-edge.json"
  : "data/testing/uat-results.json";
const OUTPUT_JSON = isEdge
  ? "data/testing/uat-analysis-edge.json"
  : "data/testing/uat-analysis.json";
const OUTPUT_MD = isEdge
  ? "data/testing/uat-analysis-edge.md"
  : "data/testing/uat-analysis.md";

function safeJson<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function countBy<T>(items: T[], keyFn: (item: T) => string | null | undefined) {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

async function main() {
  const inputs = JSON.parse(readFileSync(INPUTS_PATH, "utf-8")) as any[];
  const results = JSON.parse(readFileSync(RESULTS_PATH, "utf-8")) as any[];

  const scenarioById = new Map(inputs.map((input) => [input.id, input]));
  const success = results.filter((row) => row.recommendationId);
  const errors = results.filter((row) => row.error);

  const recIds = success.map((row) => row.recommendationId as string);
  const feedbacks = await prisma.feedback.findMany({
    where: { recommendationId: { in: recIds } },
    select: {
      recommendationId: true,
      helpful: true,
      rating: true,
      accuracy: true,
      accuracyRating: true,
      comments: true,
      issues: true,
      retrievedChunks: true,
      createdAt: true,
    },
  });

  const feedbackByRec = new Map(feedbacks.map((f) => [f.recommendationId, f]));

  const overallRatings: number[] = [];
  const accuracyRatings: number[] = [];
  let helpfulCount = 0;

  const byType = new Map<string, { ratings: number[]; accuracy: number[]; helpful: number }>();
  const issueTagCounts = new Map<string, number>();
  const wrongCounts = new Map<string, number>();
  const missingChunkCounts = new Map<string, number>();
  const missingSourceCounts = new Map<string, number>();
  const lowRelevanceUsed: number[] = [];
  const usedChunkScores: number[] = [];

  success.forEach((row) => {
    const feedback = feedbackByRec.get(row.recommendationId);
    if (!feedback) return;
    const scenario = scenarioById.get(row.scenarioId);
    const type = scenario?.type || "unknown";

    const comments = safeJson<any>(feedback.comments) || {};
    const issues = safeJson<any>(feedback.issues) || {};

    const overall =
      feedback.rating ?? comments.overallRating ?? comments.rating ?? null;
    const accuracy =
      feedback.accuracy ??
      feedback.accuracyRating ??
      comments.accuracyRating ??
      null;

    if (overall) overallRatings.push(Number(overall));
    if (accuracy) accuracyRatings.push(Number(accuracy));
    if (feedback.helpful) helpfulCount += 1;

    const bucket = byType.get(type) || { ratings: [], accuracy: [], helpful: 0 };
    if (overall) bucket.ratings.push(Number(overall));
    if (accuracy) bucket.accuracy.push(Number(accuracy));
    if (feedback.helpful) bucket.helpful += 1;
    byType.set(type, bucket);

    const issueTags = issues.issueTags || comments.issueTags || [];
    issueTags.forEach((tag: string) => {
      const key = normalize(tag);
      issueTagCounts.set(key, (issueTagCounts.get(key) || 0) + 1);
    });

    const wrong = comments.whatWasWrongOrMissing || comments.whatWasWrong || [];
    wrong.forEach((item: string) => {
      const key = normalize(item);
      if (!key) return;
      wrongCounts.set(key, (wrongCounts.get(key) || 0) + 1);
    });

    const retrieved = safeJson<any>(feedback.retrievedChunks) || {};
    const used = retrieved.used || [];
    const missed = retrieved.missed || [];

    used.forEach((entry: any) => {
      if (typeof entry.score === "number") {
        usedChunkScores.push(entry.score);
        if (entry.score < 0.1) lowRelevanceUsed.push(entry.score);
      }
    });

    missed.forEach((entry: any) => {
      if (entry.chunkId) {
        missingChunkCounts.set(
          entry.chunkId,
          (missingChunkCounts.get(entry.chunkId) || 0) + 1
        );
      }
      if (entry.title) {
        missingSourceCounts.set(
          entry.title,
          (missingSourceCounts.get(entry.title) || 0) + 1
        );
      }
    });
  });

  const issueTagsTop = Array.from(issueTagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  const wrongTop = Array.from(wrongCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([item, count]) => ({ item, count }));

  const missingChunksTop = Array.from(missingChunkCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([chunkId, count]) => ({ chunkId, count }));

  const missingSourcesTop = Array.from(missingSourceCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([title, count]) => ({ title, count }));

  const byTypeSummary = Array.from(byType.entries()).map(([type, data]) => ({
    type,
    count: data.ratings.length,
    avgOverall: Number(mean(data.ratings).toFixed(2)),
    avgAccuracy: Number(mean(data.accuracy).toFixed(2)),
    helpfulRate: data.ratings.length
      ? Number((data.helpful / data.ratings.length).toFixed(3))
      : 0,
  }));

  const summary = {
    totalInputs: inputs.length,
    totalResults: results.length,
    completed: success.length,
    errors: errors.length,
    helpfulRate: Number((helpfulCount / Math.max(success.length, 1)).toFixed(3)),
    avgOverall: Number(mean(overallRatings).toFixed(2)),
    avgAccuracy: Number(mean(accuracyRatings).toFixed(2)),
    lowRelevanceRate: Number(
      (lowRelevanceUsed.length / Math.max(usedChunkScores.length, 1)).toFixed(3)
    ),
    avgUsedChunkScore: Number(mean(usedChunkScores).toFixed(2)),
  };

  const analysis = {
    summary,
    byType: byTypeSummary,
    issueTagsTop,
    wrongTop,
    missingChunksTop,
    missingSourcesTop,
  };

  writeFileSync(OUTPUT_JSON, `${JSON.stringify(analysis, null, 2)}\n`, "utf-8");

  const md = `# UAT Recommendation Analysis\n\n` +
    `## Summary\n` +
    `- Total inputs: ${summary.totalInputs}\n` +
    `- Completed recommendations: ${summary.completed}\n` +
    `- Errors: ${summary.errors}\n` +
    `- Helpful rate: ${(summary.helpfulRate * 100).toFixed(1)}%\n` +
    `- Avg overall rating: ${summary.avgOverall}/5\n` +
    `- Avg diagnosis accuracy: ${summary.avgAccuracy}/5\n` +
    `- Avg used-chunk match score: ${summary.avgUsedChunkScore}\n` +
    `- Low-relevance used chunks: ${(summary.lowRelevanceRate * 100).toFixed(1)}%\n\n` +
    `## By Input Type\n` +
    byTypeSummary
      .map(
        (row) =>
          `- ${row.type}: n=${row.count}, avgOverall=${row.avgOverall}, avgAccuracy=${row.avgAccuracy}, helpfulRate=${(row.helpfulRate * 100).toFixed(1)}%`
      )
      .join("\n") +
    `\n\n## Top Issue Tags\n` +
    issueTagsTop.map((row) => `- ${row.tag}: ${row.count}`).join("\n") +
    `\n\n## Top Missing/Incorrect Items\n` +
    wrongTop.map((row) => `- ${row.item}: ${row.count}`).join("\n") +
    `\n\n## Most Missed Chunks\n` +
    missingChunksTop.map((row) => `- ${row.chunkId}: ${row.count}`).join("\n") +
    `\n\n## Most Missed Sources\n` +
    missingSourcesTop.map((row) => `- ${row.title}: ${row.count}`).join("\n") +
    `\n`;

  writeFileSync(OUTPUT_MD, md, "utf-8");

  console.log("UAT analysis saved:", OUTPUT_MD);
}

main().catch((error) => {
  console.error("Analysis failed:", error);
  process.exit(1);
});
