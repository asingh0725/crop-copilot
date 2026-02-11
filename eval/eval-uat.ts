/**
 * Evaluation script for UAT scenarios.
 *
 * Usage:
 *   pnpm eval                          # Full eval with LLM judge
 *   pnpm eval:rules-only               # Rules-only, no API calls
 *   pnpm eval -- --limit=10            # Process first 10 scenarios
 *   pnpm eval -- --scenarios=path.json # Load scenarios from file
 *   pnpm eval -- --summary-only        # Just generate report from existing evals
 *
 * Rate limit strategy:
 *   - Sequential processing (1 scenario at a time)
 *   - Haiku judge: 50K input TPM, 10K output TPM
 *   - ~500 input tokens per faithfulness check
 */

import { loadEnvConfig } from "@next/env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import {
  scoreRecommendation,
  type RecommendationData,
  type AuditData,
} from "@/lib/eval/rule-scorer";
import { judgeFaithfulness } from "@/lib/eval/faithfulness-judge";

loadEnvConfig(process.cwd());

// --- CLI Args ---
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.replace(/^--/, "").split("=");
    return [k, rest.join("=") || "true"];
  })
);

const skipLlm = args.get("skip-llm") === "true";
const summaryOnly = args.get("summary-only") === "true";
const limit = Number(args.get("limit") || 0);
const scenariosPath = args.get("scenarios");

// --- Rate limiter (reused from UAT batch) ---
class TokenRateLimiter {
  private events: Array<{ time: number; tokens: number }> = [];

  constructor(private tpm: number) {}

  private prune(now: number) {
    this.events = this.events.filter((e) => now - e.time < 60_000);
  }

  private sum() {
    return this.events.reduce((t, e) => t + e.tokens, 0);
  }

  async waitForBudget(tokens: number) {
    while (true) {
      const now = Date.now();
      this.prune(now);
      if (this.sum() + tokens <= this.tpm) return;
      const oldest = this.events[0];
      const waitMs = oldest ? Math.max(0, 60_000 - (now - oldest.time)) : 1000;
      await new Promise((r) => setTimeout(r, Math.max(waitMs, 1000)));
    }
  }

  record(tokens: number) {
    this.events.push({ time: Date.now(), tokens });
  }
}

const inputLimiter = new TokenRateLimiter(50_000); // Haiku input TPM

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Types ---
interface EvalResult {
  scenarioId: string | null;
  recommendationId: string;
  crop: string;
  region: string;
  overall: number;
  accuracy: number;
  helpfulness: number;
  faithfulness: number;
  actionability: number;
  completeness: number;
  retrievalRelevance: number;
  issues: string[];
  missingEvidence: string[];
}

// --- Main ---
async function evaluateScenarios(): Promise<EvalResult[]> {
  // Load scenarios
  let scenarioIds: string[] = [];

  if (scenariosPath) {
    // Load from JSON file
    const fileScenarios = JSON.parse(
      readFileSync(resolve(process.cwd(), scenariosPath), "utf-8")
    ) as Array<{ id: string; inputId?: string }>;
    scenarioIds = fileScenarios.map((s) => s.id);
  } else {
    // Load from DB
    const dbScenarios = await prisma.testScenario.findMany({
      where: { inputId: { not: null } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    scenarioIds = dbScenarios.map((s) => s.id);
  }

  if (limit > 0) {
    scenarioIds = scenarioIds.slice(0, limit);
  }

  console.log(`Evaluating ${scenarioIds.length} scenarios (skipLlm=${skipLlm})`);

  const results: EvalResult[] = [];

  for (let i = 0; i < scenarioIds.length; i++) {
    const scenarioId = scenarioIds[i];

    try {
      const scenario = await prisma.testScenario.findUnique({
        where: { id: scenarioId },
        include: {
          input: {
            include: {
              recommendations: {
                include: {
                  sources: {
                    include: {
                      textChunk: { include: { source: true } },
                      imageChunk: { include: { source: true } },
                    },
                  },
                  retrievalAudits: {
                    orderBy: { createdAt: "desc" as const },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });

      if (!scenario || !scenario.input?.recommendations) {
        console.log(`  [${i + 1}/${scenarioIds.length}] Skip: no recommendation for scenario ${scenarioId}`);
        continue;
      }

      const recommendation = scenario.input.recommendations;
      const recData = recommendation.diagnosis as unknown as RecommendationData;

      // Build expected values
      const expected = {
        diagnosis: scenario.expectedDiagnosis,
        conditionType: scenario.expectedConditionType,
        mustInclude: scenario.mustInclude,
        shouldAvoid: scenario.shouldAvoid,
      };

      // Build audit data
      const audit = recommendation.retrievalAudits[0];
      const auditData: AuditData | undefined = audit
        ? {
            candidateChunks: audit.candidateChunks as AuditData["candidateChunks"],
            usedChunks: audit.usedChunks as AuditData["usedChunks"],
            missedChunks: audit.missedChunks as AuditData["missedChunks"],
          }
        : undefined;

      // Rule-based scoring
      const ruleScores = scoreRecommendation({
        recommendation: recData,
        expected,
        retrievalAudit: auditData,
      });

      // LLM faithfulness judge
      let faithfulness = 3;
      let llmJudgeOutput: any = null;

      if (!skipLlm) {
        const chunks = recommendation.sources.map((s) => {
          const chunk = s.textChunk || s.imageChunk;
          const sourceDoc = s.textChunk?.source || s.imageChunk?.source;
          return {
            id: s.textChunkId || s.imageChunkId || "",
            content: s.textChunk?.content || s.imageChunk?.caption || "",
            sourceTitle: sourceDoc?.title || "Unknown",
          };
        });

        // Estimate input tokens (~4 chars per token)
        const inputEstimate = Math.ceil(
          chunks.reduce((sum, c) => sum + c.content.length, 0) / 4 + 200
        );
        await inputLimiter.waitForBudget(inputEstimate);

        const judgeResult = await judgeFaithfulness({
          recommendation: recData,
          chunks,
        });

        faithfulness = judgeResult.faithfulness;
        llmJudgeOutput = {
          perAction: judgeResult.perAction,
          rawOutput: judgeResult.rawOutput,
        };
        inputLimiter.record(inputEstimate);

        // Small delay between LLM calls
        await sleep(1200);
      }

      // Compute overall
      const dimensions = [
        ruleScores.accuracy,
        ruleScores.helpfulness,
        faithfulness,
        ruleScores.actionability,
        ruleScores.completeness,
        ruleScores.retrievalRelevance,
      ];
      const overall = Math.round(
        dimensions.reduce((s, d) => s + d, 0) / dimensions.length
      );

      // Store evaluation in DB
      await prisma.evaluation.create({
        data: {
          recommendationId: recommendation.id,
          scenarioId: scenario.id,
          overall,
          accuracy: ruleScores.accuracy,
          helpfulness: ruleScores.helpfulness,
          faithfulness,
          actionability: ruleScores.actionability,
          completeness: ruleScores.completeness,
          retrievalRelevance: ruleScores.retrievalRelevance,
          issues: ruleScores.issues,
          missingEvidence: ruleScores.missingEvidence,
          llmJudgeOutput,
        },
      });

      const result: EvalResult = {
        scenarioId: scenario.id,
        recommendationId: recommendation.id,
        crop: scenario.crop,
        region: scenario.location,
        overall,
        accuracy: ruleScores.accuracy,
        helpfulness: ruleScores.helpfulness,
        faithfulness,
        actionability: ruleScores.actionability,
        completeness: ruleScores.completeness,
        retrievalRelevance: ruleScores.retrievalRelevance,
        issues: ruleScores.issues,
        missingEvidence: ruleScores.missingEvidence,
      };

      results.push(result);
      console.log(
        `  [${i + 1}/${scenarioIds.length}] ${scenario.crop}/${scenario.location} | overall=${overall} acc=${ruleScores.accuracy} help=${ruleScores.helpfulness} faith=${faithfulness}`
      );
    } catch (error) {
      console.error(`  [${i + 1}/${scenarioIds.length}] Error on ${scenarioId}:`, error);
    }
  }

  return results;
}

// --- Summary report ---
function avg(values: number[]): string {
  if (values.length === 0) return "N/A";
  return (values.reduce((s, v) => s + v, 0) / values.length).toFixed(2);
}

async function generateReport(results: EvalResult[]): Promise<string> {
  let report = `# Evaluation Report\n\n`;
  report += `**Date:** ${new Date().toISOString()}\n`;
  report += `**Scenarios evaluated:** ${results.length}\n`;
  report += `**LLM judge:** ${skipLlm ? "skipped" : "Haiku"}\n\n`;

  // Overall averages
  report += `## Overall Metrics\n\n`;
  report += `| Dimension | Avg Score |\n|---|---|\n`;
  report += `| Overall | ${avg(results.map((r) => r.overall))} |\n`;
  report += `| Accuracy | ${avg(results.map((r) => r.accuracy))} |\n`;
  report += `| Helpfulness | ${avg(results.map((r) => r.helpfulness))} |\n`;
  report += `| Faithfulness | ${avg(results.map((r) => r.faithfulness))} |\n`;
  report += `| Actionability | ${avg(results.map((r) => r.actionability))} |\n`;
  report += `| Completeness | ${avg(results.map((r) => r.completeness))} |\n`;
  report += `| Retrieval Relevance | ${avg(results.map((r) => r.retrievalRelevance))} |\n\n`;

  // Per-crop breakdown
  const byCrop: Record<string, EvalResult[]> = {};
  for (const r of results) {
    if (!byCrop[r.crop]) byCrop[r.crop] = [];
    byCrop[r.crop].push(r);
  }

  report += `## Per-Crop Accuracy & Helpfulness\n\n`;
  report += `| Crop | Count | Avg Accuracy | Avg Helpfulness |\n|---|---|---|---|\n`;
  for (const [crop, items] of Object.entries(byCrop).sort()) {
    report += `| ${crop} | ${items.length} | ${avg(items.map((r) => r.accuracy))} | ${avg(items.map((r) => r.helpfulness))} |\n`;
  }
  report += `\n`;

  // Per-region breakdown
  const byRegion: Record<string, EvalResult[]> = {};
  for (const r of results) {
    if (!byRegion[r.region]) byRegion[r.region] = [];
    byRegion[r.region].push(r);
  }

  report += `## Per-Region Accuracy & Helpfulness\n\n`;
  report += `| Region | Count | Avg Accuracy | Avg Helpfulness |\n|---|---|---|---|\n`;
  for (const [region, items] of Object.entries(byRegion).sort()) {
    report += `| ${region} | ${items.length} | ${avg(items.map((r) => r.accuracy))} | ${avg(items.map((r) => r.helpfulness))} |\n`;
  }
  report += `\n`;

  // Most-missed sources from RetrievalAudit
  const audits = await prisma.retrievalAudit.findMany({
    select: { missedChunks: true },
  });

  const missedCounts: Record<string, number> = {};
  for (const audit of audits) {
    const missed = audit.missedChunks as Array<{ sourceId?: string }>;
    if (!Array.isArray(missed)) continue;
    for (const chunk of missed) {
      if (chunk.sourceId) {
        missedCounts[chunk.sourceId] = (missedCounts[chunk.sourceId] || 0) + 1;
      }
    }
  }

  const topMissed = Object.entries(missedCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  if (topMissed.length > 0) {
    // Fetch source titles
    const sourceIds = topMissed.map(([id]) => id);
    const sources = await prisma.source.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, title: true },
    });
    const titleMap = new Map(sources.map((s) => [s.id, s.title]));

    report += `## Top 10 Most-Missed Sources\n\n`;
    report += `| Source | Times Missed |\n|---|---|\n`;
    for (const [sourceId, count] of topMissed) {
      const title = titleMap.get(sourceId) || sourceId;
      report += `| ${title} | ${count} |\n`;
    }
    report += `\n`;
  }

  // Low-faithfulness recommendations
  const lowFaith = results.filter((r) => r.faithfulness < 3);
  if (lowFaith.length > 0) {
    report += `## Low-Faithfulness Recommendations (< 3)\n\n`;
    report += `| Recommendation ID | Crop | Region | Faithfulness | Issues |\n|---|---|---|---|---|\n`;
    for (const r of lowFaith) {
      report += `| ${r.recommendationId} | ${r.crop} | ${r.region} | ${r.faithfulness} | ${r.issues.join("; ")} |\n`;
    }
    report += `\n`;
  }

  // Low retrieval relevance
  const lowRetrieval = results.filter((r) => r.retrievalRelevance < 3);
  if (lowRetrieval.length > 0) {
    report += `## Low Retrieval Relevance (< 3)\n\n`;
    report += `| Recommendation ID | Crop | Region | Retrieval Relevance |\n|---|---|---|---|\n`;
    for (const r of lowRetrieval) {
      report += `| ${r.recommendationId} | ${r.crop} | ${r.region} | ${r.retrievalRelevance} |\n`;
    }
    report += `\n`;
  }

  // Issue frequency
  const issueFreq: Record<string, number> = {};
  for (const r of results) {
    for (const issue of r.issues) {
      issueFreq[issue] = (issueFreq[issue] || 0) + 1;
    }
  }

  if (Object.keys(issueFreq).length > 0) {
    report += `## Issue Frequency\n\n`;
    report += `| Issue | Count |\n|---|---|\n`;
    for (const [issue, count] of Object.entries(issueFreq).sort(
      ([, a], [, b]) => b - a
    )) {
      report += `| ${issue} | ${count} |\n`;
    }
  }

  return report;
}

async function main() {
  const outputDir = resolve(process.cwd(), "data/eval");
  mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  let results: EvalResult[];

  if (summaryOnly) {
    // Load existing evaluations from DB
    const evals = await prisma.evaluation.findMany({
      include: {
        scenario: { select: { crop: true, location: true } },
        recommendation: {
          select: { input: { select: { crop: true, location: true } } },
        },
      },
    });

    results = evals.map((e) => ({
      scenarioId: e.scenarioId,
      recommendationId: e.recommendationId,
      crop: e.scenario?.crop || e.recommendation?.input?.crop || "unknown",
      region:
        e.scenario?.location ||
        e.recommendation?.input?.location ||
        "unknown",
      overall: e.overall,
      accuracy: e.accuracy,
      helpfulness: e.helpfulness,
      faithfulness: e.faithfulness,
      actionability: e.actionability,
      completeness: e.completeness,
      retrievalRelevance: e.retrievalRelevance,
      issues: (e.issues as string[]) || [],
      missingEvidence: (e.missingEvidence as string[]) || [],
    }));
  } else {
    results = await evaluateScenarios();
  }

  // Save JSON
  const jsonPath = resolve(outputDir, `eval-${timestamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(results, null, 2) + "\n", "utf-8");
  console.log(`\nSaved ${results.length} eval results to ${jsonPath}`);

  // Generate and save report
  const report = await generateReport(results);
  const mdPath = resolve(outputDir, `eval-${timestamp}.md`);
  writeFileSync(mdPath, report, "utf-8");
  console.log(`Saved report to ${mdPath}`);

  // Print summary to console
  console.log("\n--- Summary ---");
  console.log(`Scenarios: ${results.length}`);
  console.log(`Avg Accuracy: ${avg(results.map((r) => r.accuracy))}`);
  console.log(`Avg Helpfulness: ${avg(results.map((r) => r.helpfulness))}`);
  console.log(`Avg Faithfulness: ${avg(results.map((r) => r.faithfulness))}`);
  console.log(`Avg Overall: ${avg(results.map((r) => r.overall))}`);
}

main()
  .catch((error) => {
    console.error("Eval failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
