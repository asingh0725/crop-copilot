import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
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
import { logRetrievalAudit } from "@/lib/retrieval/audit";
import {
  photoClassConfigs as baselinePhotoConfigs,
  labTemplates as baselineLabTemplates,
  type ConditionType,
} from "./inputs";
import {
  photoClassConfigs as edgePhotoConfigs,
  labTemplates as edgeLabTemplates,
} from "./inputs-edge";

const USER_ID = "80d8a54f-5c9b-4094-905a-862baadfdb3c";
const RATE_LIMIT_MS = 30_000;
loadEnvConfig(process.cwd());

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  })
);

const profile = String(args.get("profile") || "baseline");
const useEdgeProfile = profile === "edge";

const OUTPUT_PATH = useEdgeProfile
  ? "data/testing/uat-results-edge.json"
  : "data/testing/uat-results.json";
const INPUTS_PATH = useEdgeProfile
  ? "data/testing/uat-inputs-edge.json"
  : "data/testing/uat-inputs.json";
const PHOTO_IMAGES_PER_CLASS = useEdgeProfile ? 6 : 4;
const LAB_INSTANCES_PER_TEMPLATE = useEdgeProfile ? 3 : 4;

const photoClassConfigs = useEdgeProfile
  ? edgePhotoConfigs
  : baselinePhotoConfigs;
const labTemplates = useEdgeProfile ? edgeLabTemplates : baselineLabTemplates;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL");
}

if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) {
  throw new Error("Missing ANTHROPIC_API_KEY or OPENAI_API_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BATCH_SIZE = Number(args.get("batchSize") || 5);
const PER_REQUEST_DELAY_MS = Number(args.get("delayMs") || RATE_LIMIT_MS);
const BATCH_PAUSE_MS = Number(args.get("batchPauseMs") || 120_000);
const INPUT_TOKENS_PER_MIN = Number(args.get("inputTpm") || 30_000);
const OUTPUT_TOKENS_PER_MIN = Number(args.get("outputTpm") || 8_000);
const RETRY_ERRORS = args.get("retryErrors") !== "false";

type PhotoScenario = {
  id: string;
  type: "PHOTO";
  crop: string;
  location: string;
  season: string;
  description: string;
  imageSourceUrl: string;
  expectedDiagnosis: string;
  expectedConditionType: ConditionType;
  symptoms: string;
  mustInclude: string[];
  shouldAvoid: string[];
};

type LabScenario = {
  id: string;
  type: "LAB_REPORT";
  crop: string;
  location: string;
  season: string;
  description: string;
  labData: Record<string, any>;
  expectedDiagnosis: string;
  expectedConditionType: ConditionType;
  symptoms: string;
  mustInclude: string[];
  shouldAvoid: string[];
};

type UatScenario = PhotoScenario | LabScenario;

type ChunkIndex = {
  id: string;
  sourceId: string;
  content: string;
};

type SourceIndex = {
  id: string;
  title: string;
  sourceType: string;
  url: string | null;
  institution: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(text: string) {
  return text.toLowerCase();
}

class TokenRateLimiter {
  private inputEvents: Array<{ time: number; tokens: number }> = [];
  private outputEvents: Array<{ time: number; tokens: number }> = [];

  constructor(
    private inputTpm: number,
    private outputTpm: number
  ) {}

  private prune(events: Array<{ time: number; tokens: number }>, now: number) {
    return events.filter((event) => now - event.time < 60_000);
  }

  private sum(events: Array<{ time: number; tokens: number }>) {
    return events.reduce((total, event) => total + event.tokens, 0);
  }

  private nextWindowMs(events: Array<{ time: number; tokens: number }>, now: number) {
    if (events.length === 0) return 0;
    const oldest = events[0];
    return Math.max(0, 60_000 - (now - oldest.time));
  }

  async waitForBudget(inputTokens: number, outputTokens: number) {
    while (true) {
      const now = Date.now();
      this.inputEvents = this.prune(this.inputEvents, now);
      this.outputEvents = this.prune(this.outputEvents, now);
      const used = this.sum(this.inputEvents);
      const usedOutput = this.sum(this.outputEvents);
      const inputOk = used + inputTokens <= this.inputTpm;
      const outputOk = usedOutput + outputTokens <= this.outputTpm;
      if (inputOk && outputOk) return;

      const waitInput = inputOk ? 0 : this.nextWindowMs(this.inputEvents, now);
      const waitOutput = outputOk ? 0 : this.nextWindowMs(this.outputEvents, now);
      const waitMs = Math.max(waitInput, waitOutput, 1000);
      await sleep(waitMs);
    }
  }

  record(inputTokens: number, outputTokens: number) {
    const now = Date.now();
    this.inputEvents.push({ time: now, tokens: inputTokens });
    this.outputEvents.push({ time: now, tokens: outputTokens });
    this.inputEvents = this.prune(this.inputEvents, now);
    this.outputEvents = this.prune(this.outputEvents, now);
  }
}

const tokenLimiter = new TokenRateLimiter(
  INPUT_TOKENS_PER_MIN,
  OUTPUT_TOKENS_PER_MIN
);

const TOKEN_CHARS_PER = 4;
const MAX_OUTPUT_TOKENS = 2000;

function estimateTokens(text: string) {
  return Math.ceil(text.length / TOKEN_CHARS_PER);
}

function estimateInputTokens(contextTokens: number, normalizedInput: any) {
  const inputTokens = estimateTokens(JSON.stringify(normalizedInput));
  const overhead = 800;
  return contextTokens + inputTokens + overhead;
}

function tokens(text: string) {
  return normalize(text)
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
}

function buildKeywordSet(scenario: UatScenario): string[] {
  const base = [
    scenario.crop,
    scenario.expectedDiagnosis,
    scenario.symptoms,
    scenario.location,
  ];
  const all = base
    .flatMap((value) => (value ? tokens(value) : []))
    .filter(Boolean);
  return Array.from(new Set(all));
}

function scoreChunkMatch(content: string, keywords: string[]) {
  if (keywords.length === 0) return 0;
  const contentLower = normalize(content);
  let hits = 0;
  for (const keyword of keywords) {
    if (contentLower.includes(keyword)) hits += 1;
  }
  return hits / keywords.length;
}

async function fetchClassImages(className: string): Promise<string[]> {
  const encodedClass = encodeURIComponent(className);
  const response = await fetch(
    `https://api.github.com/repos/spMohanty/PlantVillage-Dataset/contents/raw/color/${encodedClass}`,
    {
      headers: {
        "User-Agent": "cropcopilot-uat",
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch class ${className}: ${response.status} ${text}`);
  }

  const data = (await response.json()) as Array<{
    name: string;
    download_url: string | null;
  }>;

  return data
    .filter((item) => item.download_url)
    .map((item) => item.download_url as string)
    .filter((url) =>
      url.match(/\.(jpg|jpeg|png|webp)$/i)
    );
}

async function buildPhotoScenarios(): Promise<PhotoScenario[]> {
  const classImageCache = new Map<string, string[]>();
  const scenarios: PhotoScenario[] = [];

  for (const config of photoClassConfigs) {
    const images = await fetchClassImages(config.className);
    if (images.length < PHOTO_IMAGES_PER_CLASS) {
      throw new Error(
        `Not enough images for ${config.className}. Found ${images.length}.`
      );
    }
    classImageCache.set(config.className, images.slice(0, 50));

    for (let i = 0; i < PHOTO_IMAGES_PER_CLASS; i += 1) {
      const imageUrl = classImageCache.get(config.className)![i];
      const description = `${config.descriptionTemplate} Crop: ${config.crop}. Growth stage: ${config.season}. Location: ${config.location}. Symptoms: ${config.symptoms}.`;

      scenarios.push({
        id: randomUUID(),
        type: "PHOTO",
        crop: config.crop,
        location: config.location,
        season: config.season,
        description,
        imageSourceUrl: imageUrl,
        expectedDiagnosis: config.expectedDiagnosis,
        expectedConditionType: config.expectedConditionType,
        symptoms: config.symptoms,
        mustInclude: config.mustInclude,
        shouldAvoid: config.shouldAvoid,
      });
    }
  }

  return scenarios;
}

function varyValue(base: number, offset: number, step: number) {
  return Number((base + offset * step).toFixed(2));
}

function buildLabScenarios(): LabScenario[] {
  const scenarios: LabScenario[] = [];
  const baseDate = new Date("2026-01-05T08:00:00.000Z");

  labTemplates.forEach((template, templateIndex) => {
    for (let instance = 0; instance < LAB_INSTANCES_PER_TEMPLATE; instance += 1) {
      const offset = instance - 2; // -2..2
      const location = template.locations[instance % template.locations.length];
      const testDate = new Date(baseDate.getTime());
      testDate.setDate(baseDate.getDate() + templateIndex + instance * 2);

      const labData = {
        ...template.labData,
        ph: varyValue(template.labData.ph, offset, 0.05),
        soilPh: varyValue(template.labData.soilPh, offset, 0.05),
        organicMatter: varyValue(template.labData.organicMatter, offset, 0.1),
        nitrogen: varyValue(template.labData.nitrogen, offset, 1),
        phosphorus: varyValue(template.labData.phosphorus, offset, 1),
        potassium: varyValue(template.labData.potassium, offset, 2),
        calcium: varyValue(template.labData.calcium, offset, 15),
        magnesium: varyValue(template.labData.magnesium, offset, 5),
        sulfur: varyValue(template.labData.sulfur, offset, 0.5),
        zinc: varyValue(template.labData.zinc, offset, 0.05),
        manganese: varyValue(template.labData.manganese, offset, 0.5),
        iron: varyValue(template.labData.iron, offset, 1),
        copper: varyValue(template.labData.copper, offset, 0.02),
        boron: varyValue(template.labData.boron, offset, 0.03),
        cec: varyValue(template.labData.cec, offset, 0.5),
        baseSaturation: varyValue(template.labData.baseSaturation, offset, 1),
        labName: template.labName,
        testDate: testDate.toISOString().split("T")[0],
        sampleId: `${template.name.toUpperCase()}-${instance + 1}`,
        crop: template.crop,
        symptoms: template.symptoms,
      };

      const description = `Lab report indicates ${template.symptoms}. Crop: ${template.crop}. Location: ${location}. Season: ${template.season}.`;

      scenarios.push({
        id: randomUUID(),
        type: "LAB_REPORT",
        crop: template.crop,
        location,
        season: template.season,
        description,
        labData,
        expectedDiagnosis: template.expectedDiagnosis,
        expectedConditionType: template.expectedConditionType,
        symptoms: template.symptoms,
        mustInclude: template.mustInclude,
        shouldAvoid: template.shouldAvoid,
      });
    }
  });

  return scenarios;
}

async function downloadImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function uploadImage(userId: string, url: string) {
  const { buffer, contentType } = await downloadImage(url);
  const filename = basename(new URL(url).pathname) || `image-${Date.now()}.jpg`;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${Date.now()}-${safeName}`;

  const { data, error } = await supabase.storage
    .from("field-images")
    .upload(path, buffer, { contentType, upsert: false });

  if (error || !data?.path) {
    throw new Error(`Upload failed: ${error?.message || "unknown"}`);
  }

  const { data: publicData } = supabase.storage
    .from("field-images")
    .getPublicUrl(data.path);

  return publicData.publicUrl;
}

function containsAny(text: string, phrases: string[]) {
  const lc = text.toLowerCase();
  return phrases.some((phrase) => lc.includes(phrase.toLowerCase()));
}

function buildFeedback(
  scenario: UatScenario,
  recommendation: any,
  chunkIndex: Map<string, ChunkIndex>,
  sourceIndex: Map<string, SourceIndex>
) {
  const recommendationBlob = [
    recommendation?.diagnosis?.condition || "",
    recommendation?.diagnosis?.reasoning || "",
    ...(recommendation?.recommendations || []).map(
      (r: any) => `${r.action} ${r.details || ""} ${r.timing || ""}`
    ),
  ].join(" ");

  const expectedDiagnosis = scenario.expectedDiagnosis.toLowerCase();
  const diagnosisText = (recommendation?.diagnosis?.condition || "").toLowerCase();
  const diagnosisMatch = expectedDiagnosis.includes("healthy")
    ? diagnosisText.includes("healthy") || diagnosisText.includes("no")
    : diagnosisText.includes(expectedDiagnosis.split(" ")[0]);

  const conditionTypeMatch =
    recommendation?.diagnosis?.conditionType ===
    scenario.expectedConditionType;

  const missingMust = scenario.mustInclude.filter(
    (item) => !containsAny(recommendationBlob, [item])
  );
  const shouldAvoidHit = scenario.shouldAvoid.filter((item) =>
    containsAny(recommendationBlob, [item])
  );

  const issueTags: string[] = [];
  const whatWasGood: string[] = [];
  const whatWasWrong: string[] = [];

  if (diagnosisMatch) {
    whatWasGood.push("Diagnosis aligns with expected agronomic issue.");
  } else {
    whatWasWrong.push(`Expected diagnosis around "${scenario.expectedDiagnosis}".`);
    issueTags.push("Diagnosis incorrect");
  }

  if (conditionTypeMatch) {
    whatWasGood.push("Condition type classification is plausible.");
  } else {
    whatWasWrong.push("Condition type did not match expected category.");
    issueTags.push("Missing key information");
  }

  if (missingMust.length === 0) {
    whatWasGood.push("Included required diagnostic and management steps.");
  } else {
    whatWasWrong.push(`Missing key items: ${missingMust.join(", ")}.`);
    issueTags.push("Missing key information");
  }

  if (shouldAvoidHit.length > 0) {
    whatWasWrong.push(
      `Contains guidance to avoid: ${shouldAvoidHit.join(", ")}.`
    );
    issueTags.push("Recommendations impractical");
  }

  const hasTiming = (recommendation?.recommendations || []).some(
    (r: any) => r.timing && String(r.timing).length > 0
  );

  if (!hasTiming) {
    whatWasWrong.push("Timing guidance was missing or unclear.");
    issueTags.push("Timing incorrect");
  }

  const usedSources = (recommendation?.sources || []).map((s: any) => {
    const chunk = chunkIndex.get(s.chunkId);
    const source = chunk ? sourceIndex.get(chunk.sourceId) : null;
    return {
      chunkId: s.chunkId,
      sourceId: chunk?.sourceId || null,
      title: source?.title || null,
      relevance: s.relevance,
    };
  });

  const keywords = buildKeywordSet(scenario);
  const usedChunkScores = usedSources.map((used) => {
    const chunk = used.chunkId ? chunkIndex.get(used.chunkId) : null;
    const score = chunk ? scoreChunkMatch(chunk.content, keywords) : 0;
    return { ...used, score };
  });

  const lowRelevance = usedChunkScores.filter((c) => c.score < 0.1);

  if (lowRelevance.length > 0) {
    whatWasWrong.push("Some cited sources appear weakly related to the input.");
    issueTags.push("Missing key information");
  }

  const candidateChunks = Array.from(chunkIndex.values())
    .map((chunk) => ({
      chunk,
      score: scoreChunkMatch(chunk.content, keywords),
    }))
    .filter((entry) => entry.score > 0.2);

  candidateChunks.sort((a, b) => b.score - a.score);

  const missingCandidates = candidateChunks
    .filter(
      (entry) =>
        !usedSources.some((used) => used.chunkId === entry.chunk.id)
    )
    .slice(0, 3)
    .map((entry) => {
      const source = sourceIndex.get(entry.chunk.sourceId);
      return {
        chunkId: entry.chunk.id,
        sourceId: entry.chunk.sourceId,
        title: source?.title || null,
        score: entry.score,
      };
    });

  const sourceCritique =
    missingCandidates.length > 0
      ? `Consider adding chunks ${missingCandidates
          .map((c) => c.chunkId)
          .join(", ")} for better coverage.`
      : "Source coverage is acceptable for the scenario.";

  const accuracyRating = Math.max(
    1,
    5 - (diagnosisMatch ? 0 : 2) - (conditionTypeMatch ? 0 : 1) - Math.min(2, missingMust.length)
  );

  const overallRating = Math.max(
    1,
    5 - (issueTags.length > 0 ? 1 : 0) - (lowRelevance.length > 1 ? 1 : 0)
  );

  const helpful = overallRating >= 4 && accuracyRating >= 4;

  const recommendToFarmer =
    overallRating >= 5 ? "yes" : overallRating >= 3 ? "yes_with_changes" : "no";

  const simulatedOutcome = {
    applied: helpful,
    success: helpful ? "yes" : accuracyRating >= 3 ? "partial" : "no",
    notes: helpful
      ? "Expected improvement in 5-10 days with correct implementation."
      : "Would require agronomist revision before field application.",
  } as const;

  return {
    helpful,
    accuracyRating,
    overallRating,
    rating: overallRating,
    accuracy: accuracyRating,
    issueTags: Array.from(new Set(issueTags)),
    whatWasGood,
    whatWasWrong,
    recommendToFarmer,
    simulatedOutcome,
    sourceCritique,
    usedSources: usedChunkScores,
    missingCandidates,
  };
}

async function loadIndexes() {
  const textChunks = await prisma.textChunk.findMany({
    select: { id: true, sourceId: true, content: true },
  });
  const imageChunks = await prisma.imageChunk.findMany({
    select: { id: true, sourceId: true, caption: true, contextText: true },
  });
  const sources = await prisma.source.findMany({
    select: { id: true, title: true, sourceType: true, url: true, institution: true },
  });

  const chunkIndex = new Map<string, ChunkIndex>();
  textChunks.forEach((chunk) => {
    chunkIndex.set(chunk.id, chunk);
  });
  imageChunks.forEach((chunk) => {
    chunkIndex.set(chunk.id, {
      id: chunk.id,
      sourceId: chunk.sourceId,
      content: chunk.caption || chunk.contextText || "",
    });
  });

  const sourceIndex = new Map<string, SourceIndex>();
  sources.forEach((source) => {
    sourceIndex.set(source.id, source);
  });

  return { chunkIndex, sourceIndex };
}

async function ensureUser() {
  const user = await prisma.user.findUnique({ where: { id: USER_ID } });
  if (!user) {
    throw new Error(`User ${USER_ID} not found in database.`);
  }
}

async function createInput(scenario: UatScenario, imageUrl?: string) {
  const existing = await prisma.input.findUnique({
    where: { id: scenario.id },
  });

  if (existing) {
    if (scenario.type === "PHOTO" && imageUrl && !existing.imageUrl) {
      return prisma.input.update({
        where: { id: scenario.id },
        data: { imageUrl },
      });
    }
    return existing;
  }

  return prisma.input.create({
    data: {
      id: scenario.id,
      userId: USER_ID,
      type: scenario.type,
      imageUrl: imageUrl ?? undefined,
      description: scenario.description,
      labData: scenario.type === "LAB_REPORT" ? scenario.labData : undefined,
      location: scenario.location,
      crop: scenario.crop,
      season: scenario.season,
    },
  });
}

async function generateRecommendation(inputId: string) {
  const input = await prisma.input.findUnique({
    where: { id: inputId },
    include: { user: { include: { profile: true } } },
  });

  if (!input) {
    throw new Error(`Input ${inputId} not found.`);
  }

  const existingRecommendation = await prisma.recommendation.findUnique({
    where: { inputId: input.id },
    select: { id: true },
  });

  if (existingRecommendation) {
    await prisma.recommendationSource.deleteMany({
      where: { recommendationId: existingRecommendation.id },
    });
    await prisma.productRecommendation.deleteMany({
      where: { recommendationId: existingRecommendation.id },
    });
    await prisma.feedback.deleteMany({
      where: { recommendationId: existingRecommendation.id },
    });
    await prisma.recommendation.delete({
      where: { id: existingRecommendation.id },
    });
  }

  const plan = buildRetrievalPlan({
    description: input.description,
    labData: input.labData as Record<string, unknown> | null,
    crop: input.crop,
    location: input.location ?? input.user.profile?.location ?? null,
    growthStage: input.season,
    type: input.type,
  });
  const sourceHints = await resolveSourceHints(plan.sourceTitleHints);
  const searchOptions = {
    crop: input.crop ?? (input.labData as any)?.crop ?? undefined,
    region: input.location ?? input.user.profile?.location ?? undefined,
    topics: plan.topics,
    sourceBoosts: sourceHints.sourceBoosts,
  };
  const textResults = await searchTextChunks(plan.query, 5, searchOptions);
  const requiredText = await fetchRequiredTextChunks(
    plan.query,
    sourceHints.requiredSourceIds
  );
  const imageResults = await searchImageChunks(plan.query, 3, searchOptions);
  const context = await assembleContext(
    [...textResults, ...requiredText],
    imageResults,
    { requiredSourceIds: sourceHints.requiredSourceIds }
  );

  if (context.totalChunks === 0) {
    throw new Error(`No relevant knowledge found for input ${inputId}`);
  }

  const normalizedInput = {
    type: input.type,
    description: input.description || undefined,
    labData: input.labData || undefined,
    imageUrl: input.imageUrl || undefined,
    crop: input.crop ?? (input.labData as any)?.crop ?? undefined,
    location: input.location ?? input.user.profile?.location ?? undefined,
  };

  const inputTokensEstimate = estimateInputTokens(
    context.totalTokens,
    normalizedInput
  );

  await tokenLimiter.waitForBudget(inputTokensEstimate, MAX_OUTPUT_TOKENS);
  const callStart = Date.now();
  const recommendation = await generateWithRetry(normalizedInput, context);
  const callDurationMs = Date.now() - callStart;
  const outputTokensEstimate = estimateTokens(JSON.stringify(recommendation));

  const recommendationId = randomUUID();
  const savedRecommendation = await prisma.recommendation.create({
    data: {
      id: recommendationId,
      userId: USER_ID,
      inputId: input.id,
      diagnosis: recommendation as object,
      confidence: recommendation.confidence,
      modelUsed: CLAUDE_MODEL,
    },
  });

  for (const source of recommendation.sources) {
    const [textChunk, imageChunk] = await Promise.all([
      prisma.textChunk.findUnique({
        where: { id: source.chunkId },
        select: { id: true },
      }),
      prisma.imageChunk.findUnique({
        where: { id: source.chunkId },
        select: { id: true },
      }),
    ]);

    await prisma.recommendationSource.create({
      data: {
        id: randomUUID(),
        recommendationId: savedRecommendation.id,
        textChunkId: textChunk ? source.chunkId : null,
        imageChunkId: imageChunk ? source.chunkId : null,
        relevanceScore: source.relevance,
      },
    });
  }

  // Log retrieval audit (fire-and-forget)
  logRetrievalAudit({
    inputId: input.id,
    recommendationId,
    plan,
    requiredSourceIds: sourceHints.requiredSourceIds,
    textCandidates: [...textResults, ...requiredText].map((r) => ({
      id: r.id,
      similarity: r.similarity,
      sourceId: r.sourceId,
    })),
    imageCandidates: imageResults.map((r) => ({
      id: r.id,
      similarity: r.similarity,
      sourceId: r.sourceId,
    })),
    assembledChunkIds: context.chunks.map((c) => c.id),
    citedChunkIds: recommendation.sources.map((s) => s.chunkId),
  });

  return {
    recommendation: recommendation as any,
    recommendationId,
    inputTokensEstimate,
    outputTokensEstimate,
    callDurationMs,
  };
}

async function persistFeedback(
  recommendationId: string,
  feedback: ReturnType<typeof buildFeedback>
) {
  await prisma.feedback.create({
    data: {
      id: randomUUID(),
      userId: USER_ID,
      recommendationId,
      helpful: feedback.helpful,
      accuracyRating: feedback.accuracyRating,
      rating: feedback.rating,
      accuracy: feedback.accuracy,
      outcome: JSON.stringify(feedback.simulatedOutcome),
      comments: JSON.stringify({
        overallRating: feedback.overallRating,
        whatWasGood: feedback.whatWasGood,
        whatWasWrongOrMissing: feedback.whatWasWrong,
        issueTags: feedback.issueTags,
        recommendToFarmer: feedback.recommendToFarmer,
        sourceCritique: feedback.sourceCritique,
      }),
      issues: {
        issueTags: feedback.issueTags,
        sourceCritique: feedback.sourceCritique,
        missingCandidates: feedback.missingCandidates,
      },
      retrievedChunks: {
        used: feedback.usedSources,
        missed: feedback.missingCandidates,
      },
      outcomeReported: true,
      outcomeApplied: feedback.simulatedOutcome.applied,
      outcomeSuccess: feedback.simulatedOutcome.success === "yes",
      outcomeNotes: feedback.simulatedOutcome.notes,
      outcomeTimestamp: new Date(),
      promptVersion: CLAUDE_MODEL,
      suggestedProducts: [],
    },
  });
}

async function main() {
  await ensureUser();
  const { chunkIndex, sourceIndex } = await loadIndexes();

  const shouldRebuild = args.get("rebuild") === "true";
  let scenarios: UatScenario[] = [];

  if (!shouldRebuild && existsSync(INPUTS_PATH)) {
    scenarios = JSON.parse(readFileSync(INPUTS_PATH, "utf-8")) as UatScenario[];
  } else {
    const photoScenarios = await buildPhotoScenarios();
    const labScenarios = buildLabScenarios();
    scenarios = [...photoScenarios, ...labScenarios];
  }

  mkdirSync("data/testing", { recursive: true });
  writeFileSync(INPUTS_PATH, `${JSON.stringify(scenarios, null, 2)}\n`, "utf-8");

  const startIndex = Number(args.get("start") || 0);
  const count = Number(args.get("count") || scenarios.length - startIndex);
  const selectedScenarios = scenarios.slice(startIndex, startIndex + count);

  const existingResults = existsSync(OUTPUT_PATH)
    ? (JSON.parse(readFileSync(OUTPUT_PATH, "utf-8")) as any[])
    : [];
  const resultsMap = new Map<string, any>();
  existingResults.forEach((result) => {
    if (result?.scenarioId) {
      resultsMap.set(result.scenarioId, result);
    }
  });

  const pendingScenarios = selectedScenarios.filter((scenario) => {
    const prior = resultsMap.get(scenario.id);
    if (!prior) return true;
    if (RETRY_ERRORS && prior.error) return true;
    return false;
  });

  const results: any[] = [];
  const totalCount = pendingScenarios.length;

  if (totalCount === 0) {
    console.log("No pending scenarios to process.");
    return;
  }

  for (let batchStart = 0; batchStart < totalCount; batchStart += BATCH_SIZE) {
    const batch = pendingScenarios.slice(batchStart, batchStart + BATCH_SIZE);
    console.log(
      `Starting batch ${Math.floor(batchStart / BATCH_SIZE) + 1} (${batch.length} items)`
    );

    for (let i = 0; i < batch.length; i += 1) {
      const scenario = batch[i];

      try {
        const existingInput = await prisma.input.findUnique({
          where: { id: scenario.id },
          select: { imageUrl: true },
        });

        let imageUrl: string | undefined;
        if (scenario.type === "PHOTO") {
          imageUrl = existingInput?.imageUrl || undefined;
          if (!imageUrl) {
            imageUrl = await uploadImage(USER_ID, scenario.imageSourceUrl);
          }
        }

        await createInput(scenario, imageUrl);

        const {
          recommendation,
          recommendationId,
          inputTokensEstimate,
          outputTokensEstimate,
          callDurationMs,
        } = await generateRecommendation(scenario.id);

        const feedback = buildFeedback(
          scenario,
          recommendation,
          chunkIndex,
          sourceIndex
        );

        await persistFeedback(recommendationId, feedback);

        const result = {
          scenarioId: scenario.id,
          type: scenario.type,
          recommendationId,
          overallRating: feedback.overallRating,
          accuracyRating: feedback.accuracyRating,
          helpful: feedback.helpful,
          inputTokensEstimate,
          outputTokensEstimate,
        };
        results.push(result);
        resultsMap.set(scenario.id, result);
        writeFileSync(
          OUTPUT_PATH,
          `${JSON.stringify(Array.from(resultsMap.values()), null, 2)}\n`,
          "utf-8"
        );

        tokenLimiter.record(inputTokensEstimate, outputTokensEstimate);

        const waitFor = Math.max(0, PER_REQUEST_DELAY_MS - callDurationMs);
        if (waitFor > 0) {
          await sleep(waitFor);
        }

        console.log(
          `Processed ${startIndex + i + 1}/${scenarios.length} | rec=${recommendationId} | overall=${feedback.overallRating} accuracy=${feedback.accuracyRating}`
        );
      } catch (error) {
        console.error(`Failed scenario ${scenario.id}:`, error);
        const result = {
          scenarioId: scenario.id,
          type: scenario.type,
          error: String(error),
        };
        results.push(result);
        resultsMap.set(scenario.id, result);
        writeFileSync(
          OUTPUT_PATH,
          `${JSON.stringify(Array.from(resultsMap.values()), null, 2)}\n`,
          "utf-8"
        );
      }
    }

    if (batchStart + BATCH_SIZE < totalCount) {
      console.log(`Batch complete. Waiting ${BATCH_PAUSE_MS / 1000}s...`);
      await sleep(BATCH_PAUSE_MS);
    }
  }

  writeFileSync(
    OUTPUT_PATH,
    `${JSON.stringify(Array.from(resultsMap.values()), null, 2)}\n`,
    "utf-8"
  );
}

main().catch((error) => {
  console.error("UAT batch failed:", error);
  process.exit(1);
});
