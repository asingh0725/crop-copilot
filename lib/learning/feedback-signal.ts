/**
 * Automatic feedback-driven learning system.
 *
 * When users submit feedback on recommendations, this module adjusts
 * source boost weights so future retrievals prioritize sources that
 * led to helpful recommendations and deprioritize sources that didn't.
 *
 * Runs inline (fire-and-forget) inside the feedback API route —
 * no cron jobs, no external infrastructure.
 */

import { prisma } from "@/lib/prisma";

const BOOST_INCREMENT = 0.03;
const BOOST_DECREMENT = 0.02;
const MAX_BOOST = 0.25;
const MIN_BOOST = -0.1;
const OUTCOME_MULTIPLIER = 2; // Outcome signals are stronger

/**
 * Process a learning signal from user feedback.
 * Fire-and-forget — never blocks the feedback response.
 */
export async function processLearningSignal(params: {
  recommendationId: string;
  helpful?: boolean | null;
  rating?: number | null;
  accuracy?: number | null;
  outcomeSuccess?: boolean | null;
}): Promise<void> {
  try {
    const { recommendationId, helpful, rating, accuracy, outcomeSuccess } =
      params;

    // Determine signal direction and strength
    const signal = computeSignal({ helpful, rating, accuracy, outcomeSuccess });
    if (signal === 0) return; // Neutral feedback, nothing to learn

    // Load the recommendation's cited sources
    const sources = await prisma.recommendationSource.findMany({
      where: { recommendationId },
      select: {
        textChunk: { select: { sourceId: true } },
        imageChunk: { select: { sourceId: true } },
      },
    });

    const citedSourceIds = Array.from(
      new Set(
        sources
          .map((s) => s.textChunk?.sourceId || s.imageChunk?.sourceId)
          .filter(Boolean) as string[]
      )
    );

    if (citedSourceIds.length === 0) return;

    // For negative feedback, also check retrieval audit for missed sources
    let missedSourceIds: string[] = [];
    if (signal < 0) {
      const audit = await prisma.retrievalAudit.findFirst({
        where: { recommendationId },
        select: { missedChunks: true },
        orderBy: { createdAt: "desc" },
      });

      if (audit?.missedChunks && Array.isArray(audit.missedChunks)) {
        const missed = audit.missedChunks as Array<{ sourceId?: string }>;
        missedSourceIds = Array.from(
          new Set(
            missed
              .map((c) => c.sourceId)
              .filter(Boolean) as string[]
          )
        );
      }
    }

    // Apply boosts
    const boostDelta = signal * BOOST_INCREMENT;

    // Boost cited sources (positive = increase, negative = decrease)
    for (const sourceId of citedSourceIds) {
      await upsertSourceBoost(sourceId, boostDelta);
    }

    // For negative feedback: boost missed sources (they should have been surfaced)
    if (signal < 0 && missedSourceIds.length > 0) {
      for (const sourceId of missedSourceIds.slice(0, 3)) {
        await upsertSourceBoost(sourceId, BOOST_INCREMENT);
      }
    }
  } catch (error) {
    // Fire-and-forget: never block the feedback response
    console.error("Learning signal processing failed:", error);
  }
}

/**
 * Compute a signal strength from -2 to +2 based on feedback.
 */
function computeSignal(params: {
  helpful?: boolean | null;
  rating?: number | null;
  accuracy?: number | null;
  outcomeSuccess?: boolean | null;
}): number {
  const { helpful, rating, accuracy, outcomeSuccess } = params;

  // Outcome is the strongest signal
  if (outcomeSuccess === true) return OUTCOME_MULTIPLIER;
  if (outcomeSuccess === false) return -OUTCOME_MULTIPLIER;

  let signal = 0;

  // Helpful boolean
  if (helpful === true) signal += 1;
  if (helpful === false) signal -= 1;

  // Rating (1-5 scale, 3 is neutral)
  if (rating != null) {
    if (rating >= 4) signal += 1;
    if (rating <= 2) signal -= 1;
  }

  // Accuracy (1-5 scale)
  if (accuracy != null) {
    if (accuracy >= 4) signal += 1;
    if (accuracy <= 2) signal -= 1;
  }

  // Clamp to [-2, 2]
  return Math.max(-2, Math.min(2, signal));
}

/**
 * Upsert a source boost in the database.
 */
async function upsertSourceBoost(
  sourceId: string,
  delta: number
): Promise<void> {
  const existing = await prisma.sourceBoost.findUnique({
    where: { sourceId },
  });

  const currentBoost = existing?.boost ?? 0;
  const newBoost = Math.max(MIN_BOOST, Math.min(MAX_BOOST, currentBoost + delta));

  await prisma.sourceBoost.upsert({
    where: { sourceId },
    create: {
      sourceId,
      boost: newBoost,
      feedbackCount: 1,
    },
    update: {
      boost: newBoost,
      feedbackCount: { increment: 1 },
    },
  });
}

/**
 * Load all learned source boosts for use in retrieval.
 * Called by the search layer to merge with static source hints.
 */
export async function getLearnedBoosts(): Promise<Record<string, number>> {
  const boosts = await prisma.sourceBoost.findMany({
    where: { boost: { not: 0 } },
    select: { sourceId: true, boost: true },
  });

  return Object.fromEntries(
    boosts.map((b: { sourceId: string; boost: number }) => [b.sourceId, b.boost])
  );
}
