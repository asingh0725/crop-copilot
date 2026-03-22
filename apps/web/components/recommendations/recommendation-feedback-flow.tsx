"use client";

import { useCallback, useEffect, useState } from "react";
import { Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { getBrowserApiBase } from "@/lib/api-client";
import { emitCreditsRefresh } from "@/lib/credits-events";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const FOLLOW_UP_DAYS = 5;
const AUTO_PROMPT_DELAY_MS = 1200;
const SNOOZE_DAY_MS = 24 * 60 * 60 * 1000;

const FEEDBACK_ISSUES = [
  "Recommendations felt too generic",
  "Diagnosis did not match symptoms",
  "Actions were unclear",
  "Sources were weak or irrelevant",
  "Timing guidance was unrealistic",
] as const;

type FeedbackIssue = (typeof FEEDBACK_ISSUES)[number];

interface FeedbackRecord {
  id: string;
  recommendationId: string;
  userId: string;
  helpful: boolean | null;
  rating: number | null;
  accuracy: number | null;
  comments: string | null;
  issues: string[];
  detailedCompletedAt?: string | null;
  outcomeApplied: boolean | null;
  outcomeSuccess: boolean | null;
  outcomeNotes: string | null;
  outcomeReported: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RecommendationFeedbackFlowProps {
  recommendationId: string;
}

interface FeedbackResponseShape {
  feedback: FeedbackRecord | null;
}

interface FeedbackSubmitShape {
  success: boolean;
  feedback: FeedbackRecord;
  creditReward?: {
    granted: boolean;
    amountUsd: number;
    balanceUsd: number;
  } | null;
}

type ModalStage = "basic" | "detailed" | "outcome";

function storageKey(recommendationId: string, stage: ModalStage): string {
  return `cropcopilot:feedback:${recommendationId}:${stage}:snooze-until`;
}

function hasBasicFeedback(feedback: FeedbackRecord | null): boolean {
  if (!feedback) {
    return false;
  }

  return (
    feedback.helpful !== null ||
    feedback.rating !== null ||
    (feedback.comments ?? "").trim().length > 0
  );
}

function hasDetailedFeedback(feedback: FeedbackRecord | null): boolean {
  if (!feedback) {
    return false;
  }

  return (
    feedback.detailedCompletedAt != null ||
    feedback.accuracy !== null ||
    feedback.issues.length > 0
  );
}

function shouldPromptOutcome(feedback: FeedbackRecord | null): boolean {
  if (!feedback || feedback.outcomeReported) {
    return false;
  }

  const anchor = feedback.updatedAt || feedback.createdAt;
  if (!anchor) {
    return false;
  }

  const anchorTimestamp = new Date(anchor).getTime();
  if (!Number.isFinite(anchorTimestamp)) {
    return false;
  }

  const elapsed = Date.now() - anchorTimestamp;
  return elapsed >= FOLLOW_UP_DAYS * SNOOZE_DAY_MS;
}

function toTrimmedOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readSnoozeUntil(recommendationId: string, stage: ModalStage): number {
  if (typeof window === "undefined") {
    return 0;
  }

  const raw = window.localStorage.getItem(storageKey(recommendationId, stage));
  if (!raw) {
    return 0;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setSnooze(recommendationId: string, stage: ModalStage, delayMs: number): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    storageKey(recommendationId, stage),
    String(Date.now() + delayMs)
  );
}

function clearSnooze(recommendationId: string, stage: ModalStage): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKey(recommendationId, stage));
}

function isSnoozed(recommendationId: string, stage: ModalStage): boolean {
  return readSnoozeUntil(recommendationId, stage) > Date.now();
}

export function RecommendationFeedbackFlow({
  recommendationId,
}: RecommendationFeedbackFlowProps) {
  const [feedback, setFeedback] = useState<FeedbackRecord | null>(null);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(true);

  const [isBasicOpen, setIsBasicOpen] = useState(false);
  const [isDetailedOpen, setIsDetailedOpen] = useState(false);
  const [isOutcomeOpen, setIsOutcomeOpen] = useState(false);

  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [basicComments, setBasicComments] = useState("");

  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [selectedIssues, setSelectedIssues] = useState<FeedbackIssue[]>([]);
  const [detailedNotes, setDetailedNotes] = useState("");

  const [outcomeSelection, setOutcomeSelection] = useState<"success" | "failure" | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const basicCompleted = hasBasicFeedback(feedback);
  const detailedCompleted = hasDetailedFeedback(feedback);
  const shouldAskOutcome = shouldPromptOutcome(feedback);

  const authedFetch = useCallback(
    async (path: string, init?: RequestInit): Promise<Response> => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const base = getBrowserApiBase();

      return fetch(`${base}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          ...(init?.headers ?? {}),
        },
      });
    },
    []
  );

  const loadFeedback = useCallback(async () => {
    setIsFeedbackLoading(true);

    try {
      const response = await authedFetch(
        `/api/v1/feedback?recommendationId=${encodeURIComponent(recommendationId)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error("Unable to load feedback");
      }

      const payload = (await response.json()) as FeedbackResponseShape;
      const nextFeedback = payload.feedback;
      setFeedback(nextFeedback ?? null);

      if (nextFeedback) {
        setHelpful(nextFeedback.helpful);
        setRating(nextFeedback.rating);
        setBasicComments(nextFeedback.comments ?? "");
        setAccuracy(nextFeedback.accuracy);
        setSelectedIssues(
          nextFeedback.issues.filter((issue): issue is FeedbackIssue =>
            FEEDBACK_ISSUES.includes(issue as FeedbackIssue)
          )
        );
        setDetailedNotes(nextFeedback.comments ?? "");
        setOutcomeSelection(
          nextFeedback.outcomeSuccess === true
            ? "success"
            : nextFeedback.outcomeSuccess === false
              ? "failure"
              : null
        );
        setOutcomeNotes(nextFeedback.outcomeNotes ?? "");
      }
    } catch (error) {
      console.error("Failed to load recommendation feedback", {
        recommendationId,
        error: (error as Error).message,
      });
    } finally {
      setIsFeedbackLoading(false);
    }
  }, [authedFetch, recommendationId]);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  useEffect(() => {
    if (isFeedbackLoading) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!basicCompleted && !isSnoozed(recommendationId, "basic")) {
        setIsBasicOpen(true);
        return;
      }

      if (basicCompleted && !detailedCompleted && !isSnoozed(recommendationId, "detailed")) {
        setIsDetailedOpen(true);
        return;
      }

      if (shouldAskOutcome && !isSnoozed(recommendationId, "outcome")) {
        setIsOutcomeOpen(true);
      }
    }, AUTO_PROMPT_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    basicCompleted,
    detailedCompleted,
    isFeedbackLoading,
    recommendationId,
    shouldAskOutcome,
  ]);

  const submitFeedback = useCallback(
    async (payload: Record<string, unknown>): Promise<FeedbackSubmitShape> => {
      const response = await authedFetch("/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({
          recommendationId,
          ...payload,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to submit feedback");
      }

      const body = (await response.json()) as FeedbackSubmitShape;
      return body;
    },
    [authedFetch, recommendationId]
  );

  const handleBasicSubmit = useCallback(async () => {
    if (helpful === null) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitFeedback({
        stage: "basic",
        helpful,
        rating: rating ?? undefined,
        comments: toTrimmedOrUndefined(basicComments),
      });

      setFeedback(result.feedback);
      clearSnooze(recommendationId, "basic");
      setIsBasicOpen(false);
      setIsDetailedOpen(true);
    } catch (error) {
      console.error("Failed to submit basic feedback", {
        recommendationId,
        error: (error as Error).message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [basicComments, helpful, rating, recommendationId, submitFeedback]);

  const handleDetailedSubmit = useCallback(async () => {
    setIsSubmitting(true);

    try {
      const result = await submitFeedback({
        stage: "detailed",
        accuracy: accuracy ?? undefined,
        issues: selectedIssues.length > 0 ? selectedIssues : undefined,
        comments: toTrimmedOrUndefined(detailedNotes),
      });

      setFeedback(result.feedback);
      if (result.creditReward?.granted) {
        toast.success(
          `Detailed feedback reward earned: $${result.creditReward.amountUsd.toFixed(2)} credit added.`
        );
        emitCreditsRefresh("feedback_reward_granted");
      }
      clearSnooze(recommendationId, "detailed");
      setIsDetailedOpen(false);
    } catch (error) {
      console.error("Failed to submit detailed feedback", {
        recommendationId,
        error: (error as Error).message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [accuracy, detailedNotes, recommendationId, selectedIssues, submitFeedback]);

  const handleOutcomeSubmit = useCallback(async () => {
    if (outcomeSelection === null) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitFeedback({
        stage: "outcome",
        outcomeApplied: true,
        outcomeSuccess: outcomeSelection === "success",
        outcomeNotes: toTrimmedOrUndefined(outcomeNotes),
      });

      setFeedback(result.feedback);
      clearSnooze(recommendationId, "outcome");
      setIsOutcomeOpen(false);
    } catch (error) {
      console.error("Failed to submit outcome feedback", {
        recommendationId,
        error: (error as Error).message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [outcomeNotes, outcomeSelection, recommendationId, submitFeedback]);

  return (
    <>
      <Dialog
        open={isBasicOpen}
        onOpenChange={(open) => {
          setIsBasicOpen(open);
          if (!open) {
            setSnooze(recommendationId, "basic", 2 * SNOOZE_DAY_MS);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Feedback</DialogTitle>
            <DialogDescription>
              Share a quick signal right after seeing the recommendation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Was this recommendation helpful?</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={helpful === true ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setHelpful(true)}
                >
                  <ThumbsUp className="h-4 w-4" />
                  Helpful
                </Button>
                <Button
                  type="button"
                  variant={helpful === false ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setHelpful(false)}
                >
                  <ThumbsDown className="h-4 w-4" />
                  Not Helpful
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Helpfulness Rating</Label>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }, (_, index) => {
                  const value = index + 1;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-label={`Rate ${value} out of 5`}
                      className="rounded p-1"
                      onClick={() => setRating(value)}
                    >
                      <Star
                        className={cn(
                          "h-5 w-5",
                          (rating ?? 0) >= value
                            ? "fill-yellow-400 text-yellow-500"
                            : "text-gray-300"
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-feedback-comments">Comment</Label>
              <Textarea
                id="quick-feedback-comments"
                value={basicComments}
                onChange={(event) => setBasicComments(event.target.value)}
                placeholder="What was most useful or missing?"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSnooze(recommendationId, "basic", 2 * SNOOZE_DAY_MS);
                setIsBasicOpen(false);
              }}
              disabled={isSubmitting}
            >
              Later
            </Button>
            <Button type="button" onClick={() => void handleBasicSubmit()} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save & Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDetailedOpen}
        onOpenChange={(open) => {
          setIsDetailedOpen(open);
          if (!open) {
            setSnooze(recommendationId, "detailed", SNOOZE_DAY_MS);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detailed Feedback</DialogTitle>
            <DialogDescription>
              Add detail on quality and issues to improve retrieval and reasoning.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Accuracy Rating</Label>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }, (_, index) => {
                  const value = index + 1;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-label={`Accuracy ${value} out of 5`}
                      className="rounded p-1"
                      onClick={() => setAccuracy(value)}
                    >
                      <Star
                        className={cn(
                          "h-5 w-5",
                          (accuracy ?? 0) >= value
                            ? "fill-yellow-400 text-yellow-500"
                            : "text-gray-300"
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>What needs improvement?</Label>
              <div className="space-y-2">
                {FEEDBACK_ISSUES.map((issue) => (
                  <label key={issue} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedIssues.includes(issue)}
                      onCheckedChange={(checked) => {
                        setSelectedIssues((previous) => {
                          if (checked === true) {
                            return previous.includes(issue) ? previous : [...previous, issue];
                          }

                          return previous.filter((entry) => entry !== issue);
                        });
                      }}
                    />
                    <span>{issue}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="detailed-feedback-notes">Additional Notes</Label>
              <Textarea
                id="detailed-feedback-notes"
                value={detailedNotes}
                onChange={(event) => setDetailedNotes(event.target.value)}
                placeholder="Any additional detail helps improve future outputs."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSnooze(recommendationId, "detailed", SNOOZE_DAY_MS);
                setIsDetailedOpen(false);
              }}
              disabled={isSubmitting}
            >
              Later
            </Button>
            <Button
              type="button"
              onClick={() => void handleDetailedSubmit()}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Detailed Feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isOutcomeOpen}
        onOpenChange={(open) => {
          setIsOutcomeOpen(open);
          if (!open) {
            setSnooze(recommendationId, "outcome", 2 * SNOOZE_DAY_MS);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Implementation Follow-up</DialogTitle>
            <DialogDescription>
              After applying this recommendation, what outcome did you observe?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Outcome</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={outcomeSelection === "success" ? "default" : "outline"}
                  onClick={() => setOutcomeSelection("success")}
                >
                  Worked
                </Button>
                <Button
                  type="button"
                  variant={outcomeSelection === "failure" ? "default" : "outline"}
                  onClick={() => setOutcomeSelection("failure")}
                >
                  Didn&apos;t Work
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="outcome-feedback-notes">Outcome Notes</Label>
              <Textarea
                id="outcome-feedback-notes"
                value={outcomeNotes}
                onChange={(event) => setOutcomeNotes(event.target.value)}
                placeholder="What changed in the field after implementation?"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSnooze(recommendationId, "outcome", 3 * SNOOZE_DAY_MS);
                setIsOutcomeOpen(false);
              }}
              disabled={isSubmitting}
            >
              Not Yet
            </Button>
            <Button type="button" onClick={() => void handleOutcomeSubmit()} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Outcome"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
