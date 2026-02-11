/**
 * Automated feedback loop: eval → find gaps → revise worst performers →
 * re-eval → adjust boosts → repeat until targets met.
 *
 * Usage:
 *   pnpm eval:loop                        # Full loop with LLM judge
 *   pnpm eval:loop -- --skip-llm          # Rules-only, no API calls for judging
 *   pnpm eval:loop -- --max-iterations=3  # Cap iterations (default 5)
 *   pnpm eval:loop -- --revise-bottom=5   # Revise bottom N per iteration (default 10)
 *   pnpm eval:loop -- --dry-run           # Eval only, no revisions
 *
 * Rate limits (Tier 1):
 *   - Sonnet: 50 req/min, 30K input TPM, 8K output TPM (revisions)
 *   - Haiku: 50 req/min, 50K input TPM, 10K output TPM (faithfulness judge)
 *   - Sequential processing with delays between calls
 */

import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import {
  scoreRecommendation,
  type RecommendationData,
  type AuditData,
} from "@/lib/eval/rule-scorer";
import { judgeFaithfulness } from "@/lib/eval/faithfulness-judge";
import {
  searchTextChunks,
  searchImageChunks,
  fetchRequiredTextChunks,
} from "@/lib/retrieval/search";
import { assembleContext } from "@/lib/retrieval/context-assembly";
import { buildRetrievalPlan } from "@/lib/retrieval/query";
import { resolveSourceHints } from "@/lib/retrieval/source-hints";
import { generateWithRetry } from "@/lib/validation/retry";
import { CLAUDE_MODEL } from "@/lib/ai/claude";

loadEnvConfig(process.cwd());

// --- Configuration ---
const TARGET_ACCURACY = 4.0;
const TARGET_HELPFULNESS = 4.0;
const BOOST_FILE = resolve(process.cwd(), "data/eval/source-boosts.json");
const OUTPUT_DIR = resolve(process.cwd(), "data/eval");

// --- CLI Args ---
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.replace(/^--/, "").split("=");
    return [k, rest.join("=") || "true"];
  })
);

const skipLlm = args.get("skip-llm") === "true";
const dryRun = args.get("dry-run") === "true";
const maxIterations = Number(args.get("max-iterations") || 5);
const reviseBottomN = Number(args.get("revise-bottom") || 10);

// --- Rate limiter ---
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
      const waitMs = oldest
        ? Math.max(0, 60_000 - (now - oldest.time))
        : 1000;
      await new Promise((r) => setTimeout(r, Math.max(waitMs, 1000)));
    }
  }

  record(tokens: number) {
    this.events.push({ time: Date.now(), tokens });
  }
}

const haikuLimiter = new TokenRateLimiter(50_000);
const sonnetLimiter = new TokenRateLimiter(30_000);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Types ---
interface EvalResult {
  recommendationId: string;
  inputId: string;
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
  missedSourceIds: string[];
}

interface IterationReport {
  iteration: number;
  timestamp: string;
  totalEvaluated: number;
  avgAccuracy: number;
  avgHelpfulness: number;
  avgOverall: number;
  targetsMetAccuracy: boolean;
  targetsMetHelpfulness: boolean;
  revisionsAttempted: number;
  revisionsImproved: number;
  boostsApplied: number;
  bottomPerformers: Array<{
    recommendationId: string;
    crop: string;
    region: string;
    accuracy: number;
    helpfulness: number;
    gapType: string;
  }>;
  humanActionItems: string[];
}

// --- Source boosts persistence ---
function loadSourceBoosts(): Record<string, number> {
  if (existsSync(BOOST_FILE)) {
    return JSON.parse(readFileSync(BOOST_FILE, "utf-8"));
  }
  return {};
}

function saveSourceBoosts(boosts: Record<string, number>) {
  mkdirSync(resolve(BOOST_FILE, ".."), { recursive: true });
  writeFileSync(BOOST_FILE, JSON.stringify(boosts, null, 2) + "\n", "utf-8");
}

// --- Step 1: Evaluate all recommendations ---
async function evaluateAll(): Promise<EvalResult[]> {
  const recommendations = await prisma.recommendation.findMany({
    include: {
      input: true,
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
    orderBy: { createdAt: "desc" as const },
  });

  console.log(`  Evaluating ${recommendations.length} recommendations...`);
  const results: EvalResult[] = [];

  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i];
    try {
      const recData = rec.diagnosis as unknown as RecommendationData;
      if (!recData || !recData.diagnosis) {
        console.log(
          `  [${i + 1}/${recommendations.length}] Skip: no diagnosis data`
        );
        continue;
      }

      // Find linked scenario for expected values
      const scenario = rec.input
        ? await prisma.testScenario.findFirst({
            where: { inputId: rec.input.id },
          })
        : null;

      const expected = scenario
        ? {
            diagnosis: scenario.expectedDiagnosis,
            conditionType: scenario.expectedConditionType,
            mustInclude: scenario.mustInclude,
            shouldAvoid: scenario.shouldAvoid,
          }
        : undefined;

      // Build audit data
      const audit = rec.retrievalAudits[0];
      const auditData: AuditData | undefined = audit
        ? {
            candidateChunks:
              audit.candidateChunks as AuditData["candidateChunks"],
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
      if (!skipLlm) {
        const chunks = rec.sources.map((s) => {
          const sourceDoc = s.textChunk?.source || s.imageChunk?.source;
          return {
            id: s.textChunkId || s.imageChunkId || "",
            content: s.textChunk?.content || s.imageChunk?.caption || "",
            sourceTitle: sourceDoc?.title || "Unknown",
          };
        });

        const inputEstimate = Math.ceil(
          chunks.reduce((sum, c) => sum + c.content.length, 0) / 4 + 200
        );
        await haikuLimiter.waitForBudget(inputEstimate);

        const judgeResult = await judgeFaithfulness({
          recommendation: recData,
          chunks,
        });
        faithfulness = judgeResult.faithfulness;
        haikuLimiter.record(inputEstimate);
        await sleep(1300);
      }

      // Overall
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

      // Extract missed source IDs from audit
      const missedSourceIds: string[] = [];
      if (auditData?.missedChunks && Array.isArray(auditData.missedChunks)) {
        for (const chunk of auditData.missedChunks as Array<{
          sourceId?: string;
        }>) {
          if (chunk.sourceId && !missedSourceIds.includes(chunk.sourceId)) {
            missedSourceIds.push(chunk.sourceId);
          }
        }
      }

      // Store evaluation
      await prisma.evaluation.create({
        data: {
          recommendationId: rec.id,
          scenarioId: scenario?.id,
          overall,
          accuracy: ruleScores.accuracy,
          helpfulness: ruleScores.helpfulness,
          faithfulness,
          actionability: ruleScores.actionability,
          completeness: ruleScores.completeness,
          retrievalRelevance: ruleScores.retrievalRelevance,
          issues: ruleScores.issues,
          missingEvidence: ruleScores.missingEvidence,
        },
      });

      results.push({
        recommendationId: rec.id,
        inputId: rec.input?.id || "",
        crop:
          rec.input?.crop ||
          (rec.input?.labData as any)?.crop ||
          "unknown",
        region: rec.input?.location || "unknown",
        overall,
        accuracy: ruleScores.accuracy,
        helpfulness: ruleScores.helpfulness,
        faithfulness,
        actionability: ruleScores.actionability,
        completeness: ruleScores.completeness,
        retrievalRelevance: ruleScores.retrievalRelevance,
        issues: ruleScores.issues,
        missedSourceIds,
      });

      if ((i + 1) % 25 === 0 || i === recommendations.length - 1) {
        const avgAcc = avg(results.map((r) => r.accuracy));
        const avgHelp = avg(results.map((r) => r.helpfulness));
        console.log(
          `  [${i + 1}/${recommendations.length}] Running avg: accuracy=${avgAcc} helpfulness=${avgHelp}`
        );
      }
    } catch (error) {
      console.error(
        `  [${i + 1}/${recommendations.length}] Error evaluating ${rec.id}:`,
        error
      );
    }
  }

  return results;
}

// --- Step 2: Identify bottom performers ---
function identifyBottomPerformers(
  results: EvalResult[],
  n: number
): EvalResult[] {
  return results
    .filter((r) => r.accuracy < TARGET_ACCURACY || r.helpfulness < TARGET_HELPFULNESS)
    .sort((a, b) => {
      // Sort by combined accuracy + helpfulness, worst first
      const scoreA = a.accuracy + a.helpfulness;
      const scoreB = b.accuracy + b.helpfulness;
      return scoreA - scoreB;
    })
    .slice(0, n);
}

// --- Step 3: Classify gap type ---
function classifyGap(result: EvalResult): string {
  if (result.retrievalRelevance <= 2) {
    // Right sources weren't surfaced
    if (result.missedSourceIds.length > 0) {
      return "retrieval_gap_missed_sources";
    }
    return "retrieval_gap_no_sources";
  }
  if (result.faithfulness <= 2) {
    return "prompt_gap_unfaithful";
  }
  if (result.accuracy <= 2) {
    return "accuracy_gap";
  }
  return "helpfulness_gap";
}

// --- Step 4: Revise a recommendation with forced sources ---
async function reviseRecommendation(
  result: EvalResult,
  sourceBoosts: Record<string, number>
): Promise<{
  improved: boolean;
  newAccuracy: number;
  newHelpfulness: number;
  boostSources: string[];
} | null> {
  const original = await prisma.recommendation.findUnique({
    where: { id: result.recommendationId },
    include: { input: true },
  });

  if (!original || !original.input) return null;

  const input = original.input;
  const forcedSourceIds = result.missedSourceIds.slice(0, 3); // Cap at 3

  if (forcedSourceIds.length === 0) {
    console.log(`    No missed sources to force for ${result.recommendationId}`);
    return null;
  }

  console.log(
    `    Revising ${result.recommendationId} with ${forcedSourceIds.length} forced sources...`
  );

  try {
    // Re-run retrieval with forced sources
    const plan = buildRetrievalPlan({
      description: input.description,
      labData: input.labData as Record<string, unknown> | null,
      crop: input.crop,
      location: input.location,
      growthStage: input.season,
      type: input.type,
    });

    const sourceHints = await resolveSourceHints(plan.sourceTitleHints);

    const allRequiredSourceIds = Array.from(
      new Set([
        ...sourceHints.requiredSourceIds,
        ...forcedSourceIds,
      ])
    );

    const searchOptions = {
      crop: input.crop ?? (input.labData as any)?.crop ?? undefined,
      region: input.location ?? undefined,
      topics: plan.topics,
      sourceBoosts: {
        ...sourceHints.sourceBoosts,
        ...sourceBoosts,
        // Boost forced sources heavily
        ...Object.fromEntries(forcedSourceIds.map((id) => [id, 0.2])),
      },
    };

    // Rate limit for Sonnet
    const inputEstimate = 3000; // ~3K tokens for retrieval + generation
    await sonnetLimiter.waitForBudget(inputEstimate);

    const textResults = await searchTextChunks(plan.query, 5, searchOptions);
    const requiredText = await fetchRequiredTextChunks(
      plan.query,
      allRequiredSourceIds
    );
    const imageResults = await searchImageChunks(plan.query, 3, searchOptions);
    const context = await assembleContext(
      [...textResults, ...requiredText],
      imageResults,
      { requiredSourceIds: allRequiredSourceIds }
    );

    if (context.totalChunks === 0) {
      console.log(`    No context for revision of ${result.recommendationId}`);
      return null;
    }

    // Re-generate recommendation
    const normalizedInput = {
      type: input.type,
      description: input.description || undefined,
      labData: input.labData || undefined,
      imageUrl: input.imageUrl || undefined,
      crop: input.crop ?? (input.labData as any)?.crop ?? undefined,
      location: input.location || undefined,
    };

    const newRec = await generateWithRetry(normalizedInput, context);
    sonnetLimiter.record(inputEstimate);
    await sleep(2000); // Respect rate limits

    // Score the revision
    const scenario = await prisma.testScenario.findFirst({
      where: { inputId: input.id },
    });

    const expected = scenario
      ? {
          diagnosis: scenario.expectedDiagnosis,
          conditionType: scenario.expectedConditionType,
          mustInclude: scenario.mustInclude,
          shouldAvoid: scenario.shouldAvoid,
        }
      : undefined;

    const revisionScores = scoreRecommendation({
      recommendation: newRec as unknown as RecommendationData,
    });

    // Store revision
    const existingRevisions = await prisma.recommendationRevision.count({
      where: { recommendationId: result.recommendationId },
    });

    await prisma.recommendationRevision.create({
      data: {
        recommendationId: result.recommendationId,
        revisionIndex: existingRevisions + 1,
        promptVersion: CLAUDE_MODEL,
        diagnosis: newRec as object,
        confidence: newRec.confidence,
        forcedSourceIds,
      },
    });

    const improved =
      revisionScores.accuracy > result.accuracy ||
      revisionScores.helpfulness > result.helpfulness;

    return {
      improved,
      newAccuracy: revisionScores.accuracy,
      newHelpfulness: revisionScores.helpfulness,
      boostSources: improved ? forcedSourceIds : [],
    };
  } catch (error) {
    console.error(
      `    Revision failed for ${result.recommendationId}:`,
      error
    );
    return null;
  }
}

// --- Utility ---
function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2));
}

function fmtAvg(values: number[]): string {
  return avg(values).toFixed(2);
}

// --- Report generation ---
function generateIterationReport(
  iteration: number,
  results: EvalResult[],
  bottomPerformers: EvalResult[],
  revisionsAttempted: number,
  revisionsImproved: number,
  boostsApplied: number
): IterationReport {
  const avgAccuracy = avg(results.map((r) => r.accuracy));
  const avgHelpfulness = avg(results.map((r) => r.helpfulness));
  const avgOverall = avg(results.map((r) => r.overall));

  const humanActionItems: string[] = [];

  // Identify items that need human attention
  const retrievalGaps = bottomPerformers.filter((r) =>
    classifyGap(r).startsWith("retrieval_gap_no_sources")
  );
  if (retrievalGaps.length > 0) {
    const crops = Array.from(new Set(retrievalGaps.map((r) => r.crop)));
    humanActionItems.push(
      `RETRIEVAL GAP: ${retrievalGaps.length} recommendations lack relevant sources. Crops affected: ${crops.join(", ")}. Consider ingesting more documents for these topics.`
    );
  }

  const promptGaps = bottomPerformers.filter(
    (r) => classifyGap(r) === "prompt_gap_unfaithful"
  );
  if (promptGaps.length > 0) {
    humanActionItems.push(
      `PROMPT GAP: ${promptGaps.length} recommendations are unfaithful to cited sources. The system prompt may need tuning for these cases.`
    );
  }

  if (revisionsAttempted > 0 && revisionsImproved === 0) {
    humanActionItems.push(
      `PLATEAU: ${revisionsAttempted} revisions attempted but none improved scores. The issue may be in scenario expectations or knowledge base coverage rather than retrieval.`
    );
  }

  // Check for crops/regions consistently below target
  const byCrop: Record<string, EvalResult[]> = {};
  for (const r of results) {
    if (!byCrop[r.crop]) byCrop[r.crop] = [];
    byCrop[r.crop].push(r);
  }
  for (const [crop, items] of Object.entries(byCrop)) {
    const cropAvgAcc = avg(items.map((r) => r.accuracy));
    const cropAvgHelp = avg(items.map((r) => r.helpfulness));
    if (cropAvgAcc < 3.0 || cropAvgHelp < 3.0) {
      humanActionItems.push(
        `WEAK CROP: "${crop}" has avg accuracy=${cropAvgAcc}, helpfulness=${cropAvgHelp}. May need better source material or scenario review.`
      );
    }
  }

  return {
    iteration,
    timestamp: new Date().toISOString(),
    totalEvaluated: results.length,
    avgAccuracy,
    avgHelpfulness,
    avgOverall,
    targetsMetAccuracy: avgAccuracy >= TARGET_ACCURACY,
    targetsMetHelpfulness: avgHelpfulness >= TARGET_HELPFULNESS,
    revisionsAttempted,
    revisionsImproved,
    boostsApplied,
    bottomPerformers: bottomPerformers.map((r) => ({
      recommendationId: r.recommendationId,
      crop: r.crop,
      region: r.region,
      accuracy: r.accuracy,
      helpfulness: r.helpfulness,
      gapType: classifyGap(r),
    })),
    humanActionItems,
  };
}

function formatReportMarkdown(
  reports: IterationReport[],
  sourceBoosts: Record<string, number>
): string {
  let md = `# Feedback Loop Report\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n`;
  md += `**Target:** accuracy >= ${TARGET_ACCURACY}, helpfulness >= ${TARGET_HELPFULNESS}\n`;
  md += `**Iterations run:** ${reports.length}\n\n`;

  // Progress table
  md += `## Progress Across Iterations\n\n`;
  md += `| Iteration | Evaluated | Avg Accuracy | Avg Helpfulness | Revisions | Improved | Boosts |\n`;
  md += `|---|---|---|---|---|---|---|\n`;
  for (const r of reports) {
    md += `| ${r.iteration} | ${r.totalEvaluated} | ${r.avgAccuracy} | ${r.avgHelpfulness} | ${r.revisionsAttempted} | ${r.revisionsImproved} | ${r.boostsApplied} |\n`;
  }
  md += `\n`;

  // Final iteration details
  const latest = reports[reports.length - 1];
  if (latest.targetsMetAccuracy && latest.targetsMetHelpfulness) {
    md += `## Result: TARGETS MET\n\n`;
    md += `Both accuracy (${latest.avgAccuracy}) and helpfulness (${latest.avgHelpfulness}) meet the >= ${TARGET_ACCURACY} / >= ${TARGET_HELPFULNESS} targets.\n\n`;
  } else {
    md += `## Result: TARGETS NOT MET\n\n`;
    if (!latest.targetsMetAccuracy) {
      md += `- Accuracy: ${latest.avgAccuracy} (target: ${TARGET_ACCURACY})\n`;
    }
    if (!latest.targetsMetHelpfulness) {
      md += `- Helpfulness: ${latest.avgHelpfulness} (target: ${TARGET_HELPFULNESS})\n`;
    }
    md += `\n`;
  }

  // Bottom performers from latest iteration
  if (latest.bottomPerformers.length > 0) {
    md += `## Bottom Performers (Latest Iteration)\n\n`;
    md += `| Recommendation | Crop | Region | Accuracy | Helpfulness | Gap Type |\n`;
    md += `|---|---|---|---|---|---|\n`;
    for (const bp of latest.bottomPerformers) {
      md += `| ${bp.recommendationId.slice(0, 12)}... | ${bp.crop} | ${bp.region} | ${bp.accuracy} | ${bp.helpfulness} | ${bp.gapType} |\n`;
    }
    md += `\n`;
  }

  // Human action items
  if (latest.humanActionItems.length > 0) {
    md += `## Action Items For You\n\n`;
    for (const item of latest.humanActionItems) {
      md += `- ${item}\n`;
    }
    md += `\n`;
  }

  // Source boosts applied
  const boostEntries = Object.entries(sourceBoosts);
  if (boostEntries.length > 0) {
    md += `## Source Boosts Applied\n\n`;
    md += `These boosts were applied to improve retrieval. Saved to \`data/eval/source-boosts.json\`.\n\n`;
    md += `| Source ID | Boost |\n|---|---|\n`;
    for (const [id, boost] of boostEntries.sort(([, a], [, b]) => b - a)) {
      md += `| ${id.slice(0, 20)}... | +${boost.toFixed(3)} |\n`;
    }
    md += `\n`;
  }

  return md;
}

// --- Main loop ---
async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);

  console.log("=== Feedback Loop ===");
  console.log(
    `Targets: accuracy >= ${TARGET_ACCURACY}, helpfulness >= ${TARGET_HELPFULNESS}`
  );
  console.log(
    `Config: maxIterations=${maxIterations}, reviseBottom=${reviseBottomN}, skipLlm=${skipLlm}, dryRun=${dryRun}`
  );
  console.log("");

  const sourceBoosts = loadSourceBoosts();
  const iterationReports: IterationReport[] = [];
  let prevAvgAccuracy = 0;
  let prevAvgHelpfulness = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`\n--- Iteration ${iteration}/${maxIterations} ---\n`);

    // Step 1: Evaluate everything
    console.log("Step 1: Evaluating all recommendations...");
    const results = await evaluateAll();

    if (results.length === 0) {
      console.log("No recommendations to evaluate. Exiting.");
      break;
    }

    const avgAccuracy = avg(results.map((r) => r.accuracy));
    const avgHelpfulness = avg(results.map((r) => r.helpfulness));

    console.log(
      `\n  Results: ${results.length} evaluated, avg accuracy=${avgAccuracy}, avg helpfulness=${avgHelpfulness}`
    );

    // Check if targets are met
    if (
      avgAccuracy >= TARGET_ACCURACY &&
      avgHelpfulness >= TARGET_HELPFULNESS
    ) {
      console.log("\n  TARGETS MET! Stopping loop.");
      const report = generateIterationReport(
        iteration,
        results,
        [],
        0,
        0,
        Object.keys(sourceBoosts).length
      );
      iterationReports.push(report);
      break;
    }

    // Check for plateau (no improvement from last iteration)
    if (
      iteration > 1 &&
      avgAccuracy <= prevAvgAccuracy &&
      avgHelpfulness <= prevAvgHelpfulness
    ) {
      console.log(
        "\n  PLATEAU DETECTED: No improvement from last iteration."
      );
      console.log("  Scores may require human intervention. See report.");
    }

    prevAvgAccuracy = avgAccuracy;
    prevAvgHelpfulness = avgHelpfulness;

    // Step 2: Find bottom performers
    console.log(
      `\nStep 2: Identifying bottom ${reviseBottomN} performers...`
    );
    const bottomPerformers = identifyBottomPerformers(results, reviseBottomN);

    console.log(`  Found ${bottomPerformers.length} below target:`);
    for (const bp of bottomPerformers) {
      const gap = classifyGap(bp);
      console.log(
        `    ${bp.crop}/${bp.region} acc=${bp.accuracy} help=${bp.helpfulness} gap=${gap} missed=${bp.missedSourceIds.length}`
      );
    }

    // Step 3: Revise bottom performers (unless dry run)
    let revisionsAttempted = 0;
    let revisionsImproved = 0;
    let boostsThisIteration = 0;

    if (!dryRun && bottomPerformers.length > 0) {
      console.log("\nStep 3: Revising bottom performers...");

      for (const bp of bottomPerformers) {
        const gap = classifyGap(bp);

        // Skip if no missed sources to force (needs human action)
        if (gap === "retrieval_gap_no_sources") {
          console.log(
            `  Skipping ${bp.recommendationId.slice(0, 12)}: no missed sources (needs KB expansion)`
          );
          continue;
        }

        if (gap === "prompt_gap_unfaithful") {
          console.log(
            `  Skipping ${bp.recommendationId.slice(0, 12)}: unfaithful output (needs prompt tuning)`
          );
          continue;
        }

        revisionsAttempted++;
        const revisionResult = await reviseRecommendation(bp, sourceBoosts);

        if (revisionResult) {
          if (revisionResult.improved) {
            revisionsImproved++;
            console.log(
              `    IMPROVED: accuracy ${bp.accuracy} → ${revisionResult.newAccuracy}, helpfulness ${bp.helpfulness} → ${revisionResult.newHelpfulness}`
            );

            // Apply boosts for sources that helped
            for (const sourceId of revisionResult.boostSources) {
              const currentBoost = sourceBoosts[sourceId] || 0;
              sourceBoosts[sourceId] = Math.min(0.25, currentBoost + 0.05);
              boostsThisIteration++;
            }
          } else {
            console.log(
              `    No improvement: accuracy ${revisionResult.newAccuracy}, helpfulness ${revisionResult.newHelpfulness}`
            );
          }
        }
      }

      // Persist updated boosts
      if (boostsThisIteration > 0) {
        saveSourceBoosts(sourceBoosts);
        console.log(
          `\n  Applied ${boostsThisIteration} source boosts (total: ${Object.keys(sourceBoosts).length})`
        );
      }
    } else if (dryRun) {
      console.log("\nStep 3: Skipped (dry run mode)");
    }

    // Generate iteration report
    const report = generateIterationReport(
      iteration,
      results,
      bottomPerformers,
      revisionsAttempted,
      revisionsImproved,
      Object.keys(sourceBoosts).length
    );
    iterationReports.push(report);

    // Check for hard plateau
    if (
      iteration > 1 &&
      revisionsAttempted > 0 &&
      revisionsImproved === 0 &&
      avgAccuracy <= prevAvgAccuracy
    ) {
      console.log(
        "\n  Hard plateau — revisions not helping. Stopping loop early."
      );
      console.log("  Check the report for human action items.");
      break;
    }
  }

  // --- Final report ---
  console.log("\n=== Loop Complete ===\n");

  // Save iteration reports JSON
  const jsonPath = resolve(OUTPUT_DIR, `loop-${timestamp}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify(iterationReports, null, 2) + "\n",
    "utf-8"
  );
  console.log(`Saved iteration data to ${jsonPath}`);

  // Save markdown report
  const mdReport = formatReportMarkdown(iterationReports, sourceBoosts);
  const mdPath = resolve(OUTPUT_DIR, `loop-${timestamp}.md`);
  writeFileSync(mdPath, mdReport, "utf-8");
  console.log(`Saved report to ${mdPath}`);

  // Print final summary
  const latest = iterationReports[iterationReports.length - 1];
  console.log(
    `\nFinal: accuracy=${latest.avgAccuracy} helpfulness=${latest.avgHelpfulness}`
  );
  if (latest.targetsMetAccuracy && latest.targetsMetHelpfulness) {
    console.log("TARGETS MET");
  } else {
    console.log("TARGETS NOT MET — review report for action items");
  }

  if (latest.humanActionItems.length > 0) {
    console.log("\nAction items for you:");
    for (const item of latest.humanActionItems) {
      console.log(`  - ${item}`);
    }
  }
}

main()
  .catch((error) => {
    console.error("Feedback loop failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
