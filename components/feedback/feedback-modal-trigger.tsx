"use client";

import { useState, useEffect } from "react";
import { FeedbackModal } from "./feedback-modal";

interface FeedbackModalTriggerProps {
  recommendationId: string;
  recommendationDate: Date;
}

interface ExistingFeedback {
  helpful: boolean | null;
  rating: number | null;
  outcomeReported: boolean;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function FeedbackModalTrigger({
  recommendationId,
  recommendationDate,
}: FeedbackModalTriggerProps) {
  const [open, setOpen] = useState(false);
  const [existingFeedback, setExistingFeedback] =
    useState<ExistingFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialStep, setInitialStep] = useState<
    "quick" | "detailed" | "outcome" | null
  >(null);

  // Storage keys
  const sessionDismissedKey = `feedback-dismissed-${recommendationId}`;
  const detailedSkippedKey = `feedback-detailed-skipped-${recommendationId}`;
  const outcomeSkippedKey = `feedback-outcome-skipped-${recommendationId}`;

  useEffect(() => {
    async function checkFeedbackAndShowModal() {
      try {
        // Check if already dismissed in this session (for quick feedback)
        const sessionDismissed = sessionStorage.getItem(sessionDismissedKey);

        // Check if detailed was skipped and when
        const detailedSkippedAt = localStorage.getItem(detailedSkippedKey);
        const daysSinceDetailedSkip = detailedSkippedAt
          ? (Date.now() - parseInt(detailedSkippedAt)) / ONE_DAY_MS
          : Infinity;

        // Check if outcome was skipped and when
        const outcomeSkippedAt = localStorage.getItem(outcomeSkippedKey);
        const daysSinceOutcomeSkip = outcomeSkippedAt
          ? (Date.now() - parseInt(outcomeSkippedAt)) / ONE_DAY_MS
          : Infinity;

        // Fetch existing feedback
        const response = await fetch(
          `/api/feedback?recommendationId=${recommendationId}`
        );

        if (response.ok) {
          const data = await response.json();
          const feedback = data.feedback;

          const daysSinceCreation = Math.floor(
            (Date.now() - new Date(recommendationDate).getTime()) / ONE_DAY_MS
          );

          if (feedback) {
            setExistingFeedback({
              helpful: feedback.helpful,
              rating: feedback.rating,
              outcomeReported: feedback.outcomeReported,
            });

            // Priority 1: Show outcome modal if 3+ days old, no outcome, and not recently skipped
            if (
              daysSinceCreation >= 3 &&
              !feedback.outcomeReported &&
              daysSinceOutcomeSkip >= 1
            ) {
              setInitialStep("outcome");
              setOpen(true);
            }
            // Priority 2: Show detailed if quick feedback given but no rating, and not recently skipped
            else if (
              feedback.helpful !== null &&
              !feedback.rating &&
              daysSinceDetailedSkip >= 1
            ) {
              setInitialStep("detailed");
              setOpen(true);
            }
            // Don't show if complete feedback exists or recently skipped
          } else {
            // No feedback exists, show quick feedback modal (unless dismissed this session)
            if (!sessionDismissed) {
              setInitialStep("quick");
              setOpen(true);
            }
          }
        } else if (!sessionDismissed) {
          // Error fetching, show quick feedback anyway
          setInitialStep("quick");
          setOpen(true);
        }
      } catch (error) {
        console.error("Error checking feedback:", error);
      } finally {
        setLoading(false);
      }
    }

    // Small delay to let page content load first
    const timer = setTimeout(checkFeedbackAndShowModal, 500);
    return () => clearTimeout(timer);
  }, [
    recommendationId,
    recommendationDate,
    sessionDismissedKey,
    detailedSkippedKey,
    outcomeSkippedKey,
  ]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);

    // Track when user skips/dismisses at different steps
    if (!newOpen && initialStep) {
      if (initialStep === "quick") {
        // Session-only dismiss for quick feedback
        sessionStorage.setItem(sessionDismissedKey, "true");
      } else if (initialStep === "detailed") {
        // Track when detailed was skipped (with timestamp for 1-day gap)
        localStorage.setItem(detailedSkippedKey, Date.now().toString());
      } else if (initialStep === "outcome") {
        // Track when outcome was skipped
        localStorage.setItem(outcomeSkippedKey, Date.now().toString());
      }
    }
  };

  if (loading) {
    return null;
  }

  return (
    <FeedbackModal
      recommendationId={recommendationId}
      recommendationDate={recommendationDate}
      open={open}
      onOpenChange={handleOpenChange}
      existingFeedback={existingFeedback}
      initialStep={initialStep}
    />
  );
}
