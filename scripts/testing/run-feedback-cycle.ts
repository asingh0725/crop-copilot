import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateScenarios } from "./generate-scenarios";
import type { BaselineRecord, ImmediateFeedback, TestScenario } from "./types";
import {
  generateRecommendation,
  type RecommendationOutput,
} from "@/lib/ai/agents/recommendation";
import { CLAUDE_MODEL } from "@/lib/ai/claude";
import { prisma } from "@/lib/prisma";
import {
  searchImageChunks,
  searchTextChunks,
  fetchRequiredTextChunks,
} from "@/lib/retrieval/search";
import { assembleContext } from "@/lib/retrieval/context-assembly";
import { buildRetrievalPlan } from "@/lib/retrieval/query";
import { resolveSourceHints } from "@/lib/retrieval/source-hints";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.replace(/^--/, "").split("=");
    return [k, rest.join("=") || "true"];
  })
);

const mode = (args.get("mode") || "mock") as "live" | "mock" | "local";
const count = Number(args.get("count") || 100);
const outputName = args.get("out") || `baseline-${mode}-${count}.json`;
const outputPath = resolve(process.cwd(), "data/testing", outputName);
const persist = args.get("persist")
  ? args.get("persist") === "true"
  : mode === "live";
const userEmail = args.get("userEmail") || "testing-bot@ai-agronomist.local";

function simulateRecommendation(scenario: TestScenario): RecommendationOutput {
  const scenarioNum = Number(scenario.id.split("_")[1] || "0");
  const includeCount = scenarioNum % 5 === 0 ? 1 : scenario.mustInclude.length;
  const includedMusts = scenario.mustInclude.slice(0, includeCount);
  const addRiskyPhrase = scenarioNum % 9 === 0;

  return {
    diagnosis: {
      condition: scenario.expectedDiagnosis,
      conditionType: scenario.expectedConditionType,
      confidence: scenario.category === "edge_case" ? 0.62 : 0.81,
      reasoning: `Pattern matched to ${scenario.expectedDiagnosis} based on ${scenario.symptoms}.`,
    },
    recommendations: [
      {
        action:
          "Confirm diagnosis with targeted scouting and diagnostic testing",
        priority: "immediate",
        timing: `Within 24-48 hours at ${scenario.growthStage}`,
        details:
          includedMusts.join("; ") +
          (addRiskyPhrase ? "; single high-rate burn risk advice" : ""),
        citations: ["sim_chunk_1", "sim_chunk_2"],
      },
      {
        action:
          "Implement risk-reducing treatment plan aligned to local thresholds",
        priority: "soon",
        details: `Use local extension thresholds for ${scenario.crop} in ${scenario.region}.`,
        citations: ["sim_chunk_3"],
      },
    ],
    products: [],
    sources:
      scenarioNum % 7 === 0
        ? []
        : [
            {
              chunkId: "sim_chunk_1",
              relevance: 0.83,
              excerpt: `${scenario.crop} guidance aligned with ${scenario.expectedDiagnosis}`,
            },
          ],
    confidence: scenario.category === "edge_case" ? 0.6 : 0.82,
  };
}

async function buildLocalSources(
  scenario: TestScenario,
  limit: number = 3
): Promise<RecommendationOutput["sources"]> {
  try {
    const terms = [
      scenario.expectedDiagnosis,
      scenario.crop,
      scenario.region,
      scenario.growthStage,
    ].filter((term): term is string => Boolean(term));

    const filters =
      terms.length > 0
        ? {
            OR: terms.map((term) => ({
              content: { contains: term, mode: "insensitive" as const },
            })),
          }
        : undefined;

    const primary = await prisma.textChunk.findMany({
      where: filters,
      select: { id: true, content: true },
      take: limit,
    });

    const seen = new Set(primary.map((c) => c.id));
    const combined = [...primary];

    if (combined.length < limit) {
      const fallback = await prisma.textChunk.findMany({
        select: { id: true, content: true },
        take: limit - combined.length,
        orderBy: { createdAt: "desc" },
      });
      for (const chunk of fallback) {
        if (seen.has(chunk.id)) continue;
        combined.push(chunk);
        seen.add(chunk.id);
        if (combined.length >= limit) break;
      }
    }

    return combined.map((chunk, index) => ({
      chunkId: chunk.id,
      relevance: Number((0.82 - index * 0.07).toFixed(2)),
      excerpt: chunk.content.slice(0, 420),
    }));
  } catch (error) {
    return [
      {
        chunkId: `local_${scenario.id}`,
        relevance: 0.6,
        excerpt: `Local heuristic source for ${scenario.expectedDiagnosis} in ${scenario.crop}.`,
      },
    ];
  }
}

async function selectLocalImage(scenario: TestScenario): Promise<{
  id: string;
  imageUrl: string;
  caption?: string | null;
  altText?: string | null;
  contextText?: string | null;
}> {
  const terms = [
    scenario.expectedDiagnosis,
    scenario.crop,
    scenario.region,
    scenario.growthStage,
  ].filter((term): term is string => Boolean(term));

  const orClauses = terms.flatMap((term) => [
    { caption: { contains: term, mode: "insensitive" as const } },
    { altText: { contains: term, mode: "insensitive" as const } },
    { contextText: { contains: term, mode: "insensitive" as const } },
  ]);

  const primary = await prisma.imageChunk.findMany({
    where: orClauses.length > 0 ? { OR: orClauses } : undefined,
    select: {
      id: true,
      imageUrl: true,
      caption: true,
      altText: true,
      contextText: true,
    },
    take: 1,
  });

  if (primary.length > 0) {
    return primary[0];
  }

  const fallback = await prisma.imageChunk.findMany({
    select: {
      id: true,
      imageUrl: true,
      caption: true,
      altText: true,
      contextText: true,
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  if (fallback.length === 0) {
    throw new Error("No image chunks available to attach to recommendation.");
  }

  return fallback[0];
}

function buildDifferentialNote(
  conditionType: TestScenario["expectedConditionType"]
): string {
  switch (conditionType) {
    case "deficiency":
      return "Differential diagnosis considered: disease, pest pressure, and abiotic stress; patterning and symptom timing favor a nutrient limitation.";
    case "disease":
      return "Differential diagnosis considered: nutrient deficiency and abiotic stress; lesion patterning and humidity-linked progression favor a pathogen.";
    case "pest":
      return "Differential diagnosis considered: foliar disease and nutrient stress; feeding pattern and localized injury favor insect pressure.";
    case "environmental":
      return "Differential diagnosis considered: pathogen and nutrient causes; symptom onset aligns with environmental stress exposure.";
    default:
      return "Differential diagnosis considered: nutrient, disease, pest, and environmental causes; signals are mixed and require confirmation.";
  }
}

function buildManagementGuidance(
  scenario: TestScenario
): { action: string; details: string } {
  switch (scenario.expectedConditionType) {
    case "deficiency":
      return {
        action: "Implement a staged nutrient correction plan",
        details:
          "Apply nutrients in split passes aligned to uptake windows, verify placement for availability, and avoid over-application under stress conditions.",
      };
    case "disease":
      return {
        action: "Apply targeted disease management with resistance stewardship",
        details:
          "Use labeled products at growth-stage-appropriate timing, rotate modes of action, and improve canopy airflow where possible.",
      };
    case "pest":
      return {
        action: "Control pest pressure based on scouting thresholds",
        details:
          "Confirm pest presence and stage, treat only if thresholds are exceeded, and preserve beneficials with selective tactics.",
      };
    case "environmental":
      return {
        action: "Mitigate environmental stress drivers",
        details:
          "Adjust irrigation or drainage, reduce additional stress inputs, and monitor recovery before major inputs.",
      };
    default:
      return {
        action: "Prioritize diagnostics before costly intervention",
        details:
          "Collect confirmatory samples, document symptom progression, and delay high-cost inputs until the root cause is verified.",
      };
  }
}

async function generateLocalRecommendation(
  scenario: TestScenario
): Promise<{ recommendation: RecommendationOutput; imageUrl: string }> {
  const image = await selectLocalImage(scenario);
  const imageExcerpt =
    image.caption || image.altText || image.contextText || "Field image context";
  const imageSource = {
    chunkId: image.id,
    relevance: 0.9,
    excerpt: imageExcerpt.slice(0, 420),
  };

  const textSources = await buildLocalSources(scenario, 2);
  const sources = [imageSource, ...textSources];
  const citationIds = sources.map((s) => s.chunkId);

  const differential = buildDifferentialNote(scenario.expectedConditionType);
  const confidence = scenario.category === "edge_case" ? 0.68 : 0.82;
  const validationItems = scenario.mustInclude.join("; ");
  const management = buildManagementGuidance(scenario);

  const recommendation: RecommendationOutput = {
    diagnosis: {
      condition: scenario.expectedDiagnosis,
      conditionType: scenario.expectedConditionType,
      confidence,
      reasoning: `Symptoms (${scenario.symptoms}) at ${scenario.growthStage} in ${scenario.region} ${scenario.crop} align with ${scenario.expectedDiagnosis}. ${differential} Validation should precede high-cost actions.`,
    },
    recommendations: [
      {
        action: "Confirm diagnosis with targeted field validation",
        priority: "immediate",
        timing: `Within 24-72 hours at ${scenario.growthStage}`,
        details: `Validation step: ${validationItems}. Document severity and spatial pattern before treatment decisions.`,
        citations: citationIds.slice(0, 2),
      },
      {
        action: management.action,
        priority: "soon",
        timing: `Next actionable window during ${scenario.growthStage}`,
        details: `${management.details} Align actions to local guidance and verify constraints before application.`,
        citations: citationIds.slice(0, 2),
      },
      {
        action: "Monitor and prevent recurrence",
        priority: "when_convenient",
        details:
          "Re-scout in 5-10 days, record outcomes, and adjust future plans (variety choice, fertility balance, or canopy management) based on field response.",
        citations: citationIds.slice(0, 1),
      },
    ],
    products: [],
    sources,
    confidence,
  };

  return { recommendation, imageUrl: image.imageUrl };
}

function containsAny(text: string, phrases: string[]): boolean {
  const lc = text.toLowerCase();
  return phrases.some((phrase) => lc.includes(phrase.toLowerCase()));
}

function evaluateExpertFeedback(
  scenario: TestScenario,
  recommendation: RecommendationOutput
): ImmediateFeedback {
  const recommendationBlob = [
    recommendation.diagnosis.condition,
    recommendation.diagnosis.reasoning,
    ...recommendation.recommendations.map(
      (r) => `${r.action} ${r.details} ${r.timing || ""}`
    ),
  ].join(" ");

  const whatWasGood: string[] = [];
  const whatWasWrongOrMissing: string[] = [];
  const issueTags: string[] = [];

  const diagnosisMatch = recommendation.diagnosis.condition
    .toLowerCase()
    .includes(scenario.expectedDiagnosis.toLowerCase().split(" ")[0]);

  const conditionTypeMatch =
    recommendation.diagnosis.conditionType === scenario.expectedConditionType;

  if (diagnosisMatch) {
    whatWasGood.push("Diagnosis aligned with expected agronomic pattern.");
  } else {
    whatWasWrongOrMissing.push(
      `Expected diagnosis around "${scenario.expectedDiagnosis}".`
    );
    issueTags.push("Diagnosis incorrect");
  }

  if (conditionTypeMatch) {
    whatWasGood.push("Condition type classification is plausible.");
  } else {
    whatWasWrongOrMissing.push("Condition type did not match scenario class.");
    issueTags.push("Missing key information");
  }

  const missingMust = scenario.mustInclude.filter(
    (x) => !containsAny(recommendationBlob, [x])
  );
  if (missingMust.length === 0) {
    whatWasGood.push(
      "Included all required high-value agronomy checks for this scenario."
    );
  } else {
    whatWasWrongOrMissing.push(
      `Missing critical items: ${missingMust.join(", ")}.`
    );
    issueTags.push("Missing key information");
  }

  const shouldAvoidViolated = scenario.shouldAvoid.filter((x) =>
    containsAny(recommendationBlob, [x])
  );
  if (shouldAvoidViolated.length > 0) {
    whatWasWrongOrMissing.push(
      `Contains risky guidance to avoid: ${shouldAvoidViolated.join(", ")}.`
    );
    issueTags.push("Recommendations impractical");
  }

  if (recommendation.sources.length === 0) {
    whatWasWrongOrMissing.push("No supporting sources were cited.");
    issueTags.push("Missing key information");
  } else {
    whatWasGood.push("Provides evidence traceability via source citations.");
  }

  const accuracyRating = Math.max(
    1,
    5 -
      (diagnosisMatch ? 0 : 2) -
      (conditionTypeMatch ? 0 : 1) -
      Math.min(2, missingMust.length)
  );
  const overallRating = Math.max(
    1,
    5 -
      (issueTags.length > 0 ? 1 : 0) -
      (recommendation.confidence > 0.9 && scenario.category === "edge_case"
        ? 1
        : 0)
  );

  const helpful = overallRating >= 4 && accuracyRating >= 4;

  const recommendToFarmer =
    overallRating >= 5 ? "yes" : overallRating >= 3 ? "yes_with_changes" : "no";

  const simulatedOutcome = {
    applied: helpful,
    success: helpful
      ? ("yes" as const)
      : accuracyRating >= 3
        ? ("partial" as const)
        : ("no" as const),
    notes: helpful
      ? `Expected visible improvement in 5-10 days for ${scenario.crop}.`
      : "Would require agronomist revision before recommending field implementation.",
  };

  return {
    helpful,
    overallRating,
    accuracyRating,
    whatWasGood,
    whatWasWrongOrMissing,
    issueTags: [...new Set(issueTags)],
    recommendToFarmer,
    simulatedOutcome,
  };
}

async function generateLiveRecommendation(
  scenario: TestScenario
): Promise<RecommendationOutput> {
  const plan = buildRetrievalPlan({
    description: `${scenario.symptoms}. Growth stage: ${scenario.growthStage}`,
    crop: scenario.crop,
    location: scenario.region,
    growthStage: scenario.growthStage,
    type: "PHOTO",
  });
  const sourceHints = await resolveSourceHints(plan.sourceTitleHints);
  const searchOptions = {
    crop: scenario.crop,
    region: scenario.region,
    topics: plan.topics,
    sourceBoosts: sourceHints.sourceBoosts,
  };
  const textResults = await searchTextChunks(plan.query, 8, searchOptions);
  const requiredText = await fetchRequiredTextChunks(
    plan.query,
    sourceHints.requiredSourceIds
  );
  const imageResults = await searchImageChunks(plan.query, 4, searchOptions);
  const context = await assembleContext(
    [...textResults, ...requiredText],
    imageResults,
    { requiredSourceIds: sourceHints.requiredSourceIds }
  );

  return generateRecommendation(
    {
      type: "photo",
      crop: scenario.crop,
      location: scenario.region,
      description: `${scenario.symptoms}. Growth stage: ${scenario.growthStage}`,
    },
    context
  );
}

async function persistRecord(
  userId: string,
  recommendationId: string,
  scenario: TestScenario,
  recommendation: RecommendationOutput,
  feedback: ImmediateFeedback,
  imageUrl?: string
): Promise<void> {
  const input = await prisma.input.create({
    data: {
      userId,
      type: "photo",
      imageUrl,
      crop: scenario.crop,
      location: scenario.region,
      description: `${scenario.symptoms}. Growth stage: ${scenario.growthStage}`,
      season: scenario.growthStage,
      labData: {
        scenarioId: scenario.id,
        category: scenario.category,
        expectedDiagnosis: scenario.expectedDiagnosis,
      },
    },
  });

  const recommendationRow = await prisma.recommendation.create({
    data: {
      id: recommendationId,
      userId,
      inputId: input.id,
      diagnosis: recommendation.diagnosis,
      confidence: recommendation.confidence,
      modelUsed:
        mode === "live"
          ? CLAUDE_MODEL
          : mode === "local"
            ? "codex-local"
            : "mock-simulator",
      tokensUsed: null,
    },
  });

  if (recommendation.sources.length > 0) {
    for (const source of recommendation.sources) {
      const textChunk = await prisma.textChunk.findUnique({
        where: { id: source.chunkId },
        select: { id: true },
      });
      const imageChunk = !textChunk
        ? await prisma.imageChunk.findUnique({
            where: { id: source.chunkId },
            select: { id: true },
          })
        : null;

      await prisma.recommendationSource.create({
        data: {
          recommendationId: recommendationRow.id,
          textChunkId: textChunk?.id,
          imageChunkId: imageChunk?.id,
          relevanceScore: source.relevance,
        },
      });
    }
  }

  await prisma.feedback.create({
    data: {
      userId,
      recommendationId: recommendationRow.id,
      helpful: feedback.helpful,
      accuracyRating: feedback.accuracyRating,
      outcome: JSON.stringify(feedback.simulatedOutcome ?? null),
      comments: JSON.stringify({
        overallRating: feedback.overallRating,
        whatWasGood: feedback.whatWasGood,
        whatWasWrongOrMissing: feedback.whatWasWrongOrMissing,
        issueTags: feedback.issueTags,
        recommendToFarmer: feedback.recommendToFarmer,
      }),
    },
  });
}

async function main() {
  mkdirSync(resolve(process.cwd(), "data/testing"), { recursive: true });

  const needsDatabase = persist || mode === "local";
  if (needsDatabase && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to persist or fetch sources.");
  }

  if (mode === "live") {
    if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) {
      throw new Error(
        "Live mode requires ANTHROPIC_API_KEY and OPENAI_API_KEY to be set."
      );
    }
  }

  const scenarioPath = args.get("scenarios");
  const scenarios = scenarioPath
    ? (
        JSON.parse(
          readFileSync(resolve(process.cwd(), scenarioPath), "utf-8")
        ) as TestScenario[]
      ).slice(0, count)
    : generateScenarios().slice(0, count);

  const records: BaselineRecord[] = [];

  let userId = "";
  if (persist) {
    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: {},
      create: { email: userEmail },
      select: { id: true },
    });
    userId = user.id;
  }

  console.log(
    `Running ${scenarios.length} recommendation tests in ${mode} mode (persist=${persist})...`
  );

  for (const scenario of scenarios) {
    const recommendationId = `rec_${scenario.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      let recommendation: RecommendationOutput;
      let imageUrl: string | undefined;

      if (mode === "live") {
        recommendation = await generateLiveRecommendation(scenario);
      } else if (mode === "local") {
        const localResult = await generateLocalRecommendation(scenario);
        recommendation = localResult.recommendation;
        imageUrl = localResult.imageUrl;
      } else {
        recommendation = simulateRecommendation(scenario);
      }

      const feedback = evaluateExpertFeedback(scenario, recommendation);

      if (persist) {
        await persistRecord(
          userId,
          recommendationId,
          scenario,
          recommendation,
          feedback,
          imageUrl
        );
      }

      records.push({
        recommendationId,
        scenario,
        diagnosis: {
          condition: recommendation.diagnosis.condition,
          conditionType: recommendation.diagnosis.conditionType,
          confidence: recommendation.diagnosis.confidence,
        },
        recommendationText: recommendation.recommendations.map(
          (r) => `${r.action}: ${r.details}`
        ),
        sourceCount: recommendation.sources.length,
        createdAt: new Date().toISOString(),
        feedback,
      });

      console.log(
        `${recommendationId} | ${scenario.category} | overall=${feedback.overallRating} accuracy=${feedback.accuracyRating} helpful=${feedback.helpful ? "yes" : "no"}`
      );
    } catch (error) {
      console.error(`Failed scenario ${scenario.id}:`, error);
    }
  }

  writeFileSync(outputPath, `${JSON.stringify(records, null, 2)}\n`, "utf-8");
  console.log(
    `Saved ${records.length} evaluated recommendations to ${outputPath}`
  );

  if (persist) {
    const totalRecommendations = await prisma.recommendation.count({
      where: { userId },
    });
    const totalFeedback = await prisma.feedback.count({ where: { userId } });
    console.log(
      `Persisted rows for ${userEmail}: recommendations=${totalRecommendations}, feedback=${totalFeedback}`
    );
  }
}

main()
  .catch((error) => {
    console.error("Feedback cycle failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
