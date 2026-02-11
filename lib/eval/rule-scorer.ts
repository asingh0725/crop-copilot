/**
 * Consolidated rule-based scoring for recommendation evaluation.
 *
 * Replaces the duplicated scoring logic in:
 * - scripts/testing/uat/run-uat-batch.ts:buildFeedback()
 * - scripts/testing/run-feedback-cycle.ts:evaluateExpertFeedback()
 */

export interface ExpectedValues {
  diagnosis: string;
  conditionType: string;
  mustInclude: string[];
  shouldAvoid: string[];
}

export interface RecommendationData {
  diagnosis: {
    condition: string;
    conditionType: string;
    confidence: number;
    reasoning: string;
  };
  recommendations: Array<{
    action: string;
    priority: string;
    timing?: string;
    details: string;
    citations: string[];
  }>;
  sources: Array<{
    chunkId: string;
    relevance: number;
    excerpt: string;
  }>;
  confidence: number;
}

export interface AuditData {
  candidateChunks: Array<{ id: string; similarity: number; cited: boolean }>;
  usedChunks: Array<{ id: string }>;
  missedChunks: Array<{ id: string; similarity: number }>;
}

export interface RuleScores {
  accuracy: number;
  helpfulness: number;
  actionability: number;
  completeness: number;
  retrievalRelevance: number;
  issues: string[];
  missingEvidence: string[];
}

function containsAny(text: string, phrases: string[]): boolean {
  const lc = text.toLowerCase();
  return phrases.some((phrase) => lc.includes(phrase.toLowerCase()));
}

/**
 * Flexible phrase matching: a mustInclude phrase is "present" if either
 * the full phrase appears as a substring, OR all significant words (3+ chars)
 * in the phrase appear somewhere in the text.
 */
function phrasePresent(text: string, phrase: string): boolean {
  const lc = text.toLowerCase();
  const phraseLc = phrase.toLowerCase();

  // Exact substring match
  if (lc.includes(phraseLc)) return true;

  // Split on " or " to handle alternatives like "scout or monitor or threshold"
  // → any one of the alternatives needs to be present
  if (phraseLc.includes(" or ")) {
    const alternatives = phraseLc.split(" or ").map((a) => a.trim());
    return alternatives.some((alt) => lc.includes(alt));
  }

  // Keyword-level match: all significant words present
  const words = phraseLc.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) return false;
  return words.every((w) => lc.includes(w));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function scoreRecommendation(params: {
  recommendation: RecommendationData;
  expected?: ExpectedValues;
  retrievalAudit?: AuditData;
}): RuleScores {
  const { recommendation, expected, retrievalAudit } = params;
  const issues: string[] = [];
  const missingEvidence: string[] = [];

  // Build full text blob for keyword matching
  const recBlob = [
    recommendation.diagnosis.condition,
    recommendation.diagnosis.reasoning,
    ...recommendation.recommendations.map(
      (r) => `${r.action} ${r.details} ${r.timing || ""}`
    ),
  ]
    .join(" ")
    .toLowerCase();

  // --- Accuracy (1-5) ---
  let accuracy = 5;
  if (expected) {
    const diagLower = recommendation.diagnosis.condition.toLowerCase();
    const expectedLower = expected.diagnosis.toLowerCase();
    const firstWord = expectedLower.split(" ")[0];

    const diagnosisMatch = expectedLower.includes("healthy")
      ? diagLower.includes("healthy") || diagLower.includes("no ")
      : diagLower.includes(firstWord);

    if (!diagnosisMatch) {
      accuracy -= 2;
      issues.push(
        `Diagnosis mismatch: expected "${expected.diagnosis}", got "${recommendation.diagnosis.condition}"`
      );
    }

    const conditionTypeMatch =
      recommendation.diagnosis.conditionType === expected.conditionType;
    if (!conditionTypeMatch) {
      accuracy -= 1;
      issues.push(
        `ConditionType mismatch: expected "${expected.conditionType}", got "${recommendation.diagnosis.conditionType}"`
      );
    }

    const missingMust = expected.mustInclude.filter(
      (item) => !phrasePresent(recBlob, item)
    );
    accuracy -= Math.min(2, missingMust.length);
    if (missingMust.length > 0) {
      missingEvidence.push(...missingMust.map((m) => `Missing: ${m}`));
    }
  }

  // --- Helpfulness (1-5) ---
  let helpfulness = 5;
  const hasTiming = recommendation.recommendations.some(
    (r) => r.timing && r.timing.length > 0
  );
  if (!hasTiming) {
    helpfulness -= 1;
    issues.push("No timing guidance in any recommendation");
  }

  if (expected) {
    const shouldAvoidHit = expected.shouldAvoid.filter((item) =>
      containsAny(recBlob, [item.toLowerCase()])
    );
    if (shouldAvoidHit.length > 0) {
      helpfulness -= 1;
      issues.push(
        `Contains guidance to avoid: ${shouldAvoidHit.join(", ")}`
      );
    }
  }

  if (recommendation.recommendations.length < 2) {
    helpfulness -= 1;
    issues.push("Fewer than 2 recommendation actions");
  }

  // --- Actionability (1-5) ---
  let actionability = 5;
  const actionsWithoutTiming = recommendation.recommendations.filter(
    (r) => !r.timing || r.timing.length === 0
  );
  actionability -= Math.min(2, actionsWithoutTiming.length);

  const hasImmediate = recommendation.recommendations.some(
    (r) => r.priority === "immediate"
  );
  if (!hasImmediate) {
    actionability -= 1;
    issues.push("No immediate-priority action");
  }

  // --- Completeness (1-5) ---
  let completeness = 5;
  if (expected) {
    const missingMust = expected.mustInclude.filter(
      (item) => !phrasePresent(recBlob, item)
    );
    completeness -= Math.min(3, missingMust.length);
  }
  if (recommendation.sources.length === 0) {
    completeness -= 1;
    issues.push("No sources cited");
  }

  // --- Retrieval Relevance (1-5) ---
  let retrievalRelevance = 3; // Default when no audit data
  if (retrievalAudit) {
    const candidates = retrievalAudit.candidateChunks;
    const relevantCandidates = candidates.filter((c) => c.similarity > 0.4);
    const usedCount = retrievalAudit.usedChunks.length;
    const missedCount = retrievalAudit.missedChunks.length;

    if (relevantCandidates.length === 0) {
      retrievalRelevance = 1;
      issues.push("No relevant candidates found in retrieval");
    } else {
      const usageRatio = usedCount / relevantCandidates.length;
      if (usageRatio >= 0.6) retrievalRelevance = 5;
      else if (usageRatio >= 0.4) retrievalRelevance = 4;
      else if (usageRatio >= 0.2) retrievalRelevance = 3;
      else retrievalRelevance = 2;

      if (missedCount > 3) {
        retrievalRelevance = Math.max(1, retrievalRelevance - 1);
        issues.push(`${missedCount} relevant chunks were not cited`);
      }
    }
  }

  return {
    accuracy: clamp(accuracy, 1, 5),
    helpfulness: clamp(helpfulness, 1, 5),
    actionability: clamp(actionability, 1, 5),
    completeness: clamp(completeness, 1, 5),
    retrievalRelevance: clamp(retrievalRelevance, 1, 5),
    issues,
    missingEvidence,
  };
}
