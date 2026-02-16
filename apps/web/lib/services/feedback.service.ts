/**
 * Feedback Service
 *
 * Handles feedback submission and retrieval operations.
 * Extracted from /api/feedback route.
 */

import { prisma } from '@/lib/prisma';
import { processLearningSignal } from '@/lib/learning/feedback-signal';
import { z } from 'zod';

export const feedbackSchema = z.object({
  recommendationId: z.string(),
  helpful: z.boolean().optional(),
  rating: z.number().min(1).max(5).optional(),
  accuracy: z.number().min(1).max(5).optional(),
  comments: z.string().optional(),
  issues: z.array(z.string()).optional(),
  // Outcome fields (for follow-up reporting)
  outcomeApplied: z.boolean().optional(),
  outcomeSuccess: z.boolean().optional(),
  outcomeNotes: z.string().optional(),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

export interface SubmitFeedbackParams {
  userId: string;
  feedbackData: FeedbackInput;
}

export interface SubmitFeedbackResult {
  success: boolean;
  feedback: {
    id: string;
    recommendationId: string;
    userId: string;
    helpful: boolean | null;
    rating: number | null;
    accuracy: number | null;
    comments: string | null;
    issues: string[];
    outcomeApplied: boolean | null;
    outcomeSuccess: boolean | null;
    outcomeNotes: string | null;
    outcomeReported: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface GetFeedbackParams {
  userId: string;
  recommendationId: string;
}

export interface GetFeedbackResult {
  id: string;
  recommendationId: string;
  userId: string;
  helpful: boolean | null;
  rating: number | null;
  accuracy: number | null;
  comments: string | null;
  issues: string[];
  outcomeApplied: boolean | null;
  outcomeSuccess: boolean | null;
  outcomeNotes: string | null;
  outcomeReported: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Submit or update feedback for a recommendation
 */
export async function submitFeedback(
  params: SubmitFeedbackParams
): Promise<SubmitFeedbackResult> {
  const { userId, feedbackData } = params;

  // Validate feedback data
  const validated = feedbackSchema.parse(feedbackData);

  // Verify user owns this recommendation
  const recommendation = await prisma.recommendation.findUnique({
    where: { id: validated.recommendationId },
    select: { userId: true },
  });

  if (!recommendation) {
    throw new Error('Recommendation not found');
  }

  if (recommendation.userId !== userId) {
    throw new Error('You can only provide feedback on your own recommendations');
  }

  // Create or update feedback
  const feedback = await prisma.feedback.upsert({
    where: { recommendationId: validated.recommendationId },
    create: {
      recommendationId: validated.recommendationId,
      userId,
      helpful: validated.helpful ?? null,
      rating: validated.rating ?? null,
      accuracy: validated.accuracy ?? null,
      comments: validated.comments ?? null,
      issues: validated.issues ?? [],
      outcomeApplied: validated.outcomeApplied ?? null,
      outcomeSuccess: validated.outcomeSuccess ?? null,
      outcomeNotes: validated.outcomeNotes ?? null,
      outcomeReported: validated.outcomeSuccess != null,
    },
    update: {
      helpful: validated.helpful ?? undefined,
      rating: validated.rating ?? undefined,
      accuracy: validated.accuracy ?? undefined,
      comments: validated.comments ?? undefined,
      issues: validated.issues ?? undefined,
      outcomeApplied: validated.outcomeApplied ?? undefined,
      outcomeSuccess: validated.outcomeSuccess ?? undefined,
      outcomeNotes: validated.outcomeNotes ?? undefined,
      outcomeReported: validated.outcomeSuccess != null ? true : undefined,
    },
  });

  // Fire-and-forget: adjust source boosts based on this feedback
  processLearningSignal({
    recommendationId: validated.recommendationId,
    helpful: validated.helpful,
    rating: validated.rating,
    accuracy: validated.accuracy,
    outcomeSuccess: validated.outcomeSuccess,
  });

  return {
    success: true,
    feedback: {
      ...feedback,
      issues: (feedback.issues as string[]) ?? [],
    },
  };
}

/**
 * Get feedback for a specific recommendation
 */
export async function getFeedback(
  params: GetFeedbackParams
): Promise<GetFeedbackResult | null> {
  const { recommendationId } = params;

  const feedback = await prisma.feedback.findUnique({
    where: { recommendationId },
  });

  if (!feedback) return null;

  return {
    ...feedback,
    issues: (feedback.issues as string[]) ?? [],
  };
}
