"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ThumbsUp,
  ThumbsDown,
  Star,
  Loader2,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types for modal steps
type ModalStep = "quick" | "detailed" | "outcome" | "success";

interface FeedbackModalProps {
  recommendationId: string;
  recommendationDate: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingFeedback?: {
    helpful: boolean | null;
    rating: number | null;
    outcomeReported: boolean;
  } | null;
  initialStep?: "quick" | "detailed" | "outcome" | null;
}

// Schemas
const detailedFeedbackSchema = z.object({
  rating: z.number().min(1, "Please provide a rating").max(5),
  accuracy: z.number().min(1, "Please rate the accuracy").max(5),
  comments: z.string().optional(),
  issues: z.array(z.string()).optional(),
});

const outcomeSchema = z.object({
  applied: z.enum(["yes", "no"]),
  success: z.enum(["yes", "no", "partial"]).optional(),
  notes: z
    .string()
    .min(10, "Please provide some details (at least 10 characters)"),
});

type DetailedFeedbackData = z.infer<typeof detailedFeedbackSchema>;
type OutcomeData = z.infer<typeof outcomeSchema>;

const issueOptions = [
  { id: "diagnosis_wrong", label: "Diagnosis was incorrect" },
  { id: "not_practical", label: "Recommendations not practical" },
  { id: "products_unavailable", label: "Suggested products not available" },
  { id: "timing_off", label: "Timing was wrong" },
  { id: "missing_info", label: "Missing important information" },
  { id: "other", label: "Other" },
];

export function FeedbackModal({
  recommendationId,
  recommendationDate,
  open,
  onOpenChange,
  existingFeedback,
  initialStep,
}: FeedbackModalProps) {
  const [step, setStep] = useState<ModalStep>("quick");
  const [loading, setLoading] = useState(false);
  const [quickFeedback, setQuickFeedback] = useState<boolean | null>(null);

  // Calculate if recommendation is older than 3 days
  const daysSinceCreation = Math.floor(
    (Date.now() - new Date(recommendationDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Use initialStep from trigger if provided, otherwise determine based on state
  useEffect(() => {
    if (initialStep) {
      setStep(initialStep);
    } else if (existingFeedback) {
      if (daysSinceCreation >= 3 && !existingFeedback.outcomeReported) {
        setStep("outcome");
      } else if (existingFeedback.helpful !== null && !existingFeedback.rating) {
        setStep("detailed");
      } else if (existingFeedback.rating) {
        onOpenChange(false);
      }
    } else {
      setStep("quick");
    }
  }, [existingFeedback, daysSinceCreation, onOpenChange, initialStep]);

  const detailedForm = useForm<DetailedFeedbackData>({
    resolver: zodResolver(detailedFeedbackSchema),
    defaultValues: {
      rating: 0,
      accuracy: 0,
      comments: "",
      issues: [],
    },
  });

  const outcomeForm = useForm<OutcomeData>({
    resolver: zodResolver(outcomeSchema),
    defaultValues: {
      applied: undefined,
      success: undefined,
      notes: "",
    },
  });

  const appliedValue = outcomeForm.watch("applied");

  const handleQuickFeedback = async (helpful: boolean) => {
    setLoading(true);
    setQuickFeedback(helpful);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId, helpful }),
      });

      if (!response.ok) throw new Error("Failed to submit feedback");

      // Move to detailed feedback step
      setStep("detailed");
    } catch (error) {
      console.error("Error submitting quick feedback:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDetailedSubmit = async (data: DetailedFeedbackData) => {
    setLoading(true);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId, ...data }),
      });

      if (!response.ok) throw new Error("Failed to submit feedback");

      setStep("success");
      setTimeout(() => {
        onOpenChange(false);
      }, 2000);
    } catch (error) {
      console.error("Error submitting detailed feedback:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOutcomeSubmit = async (data: OutcomeData) => {
    setLoading(true);

    try {
      const response = await fetch("/api/feedback/outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationId,
          outcomeApplied: data.applied === "yes",
          outcomeSuccess:
            data.success === "yes"
              ? true
              : data.success === "no"
                ? false
                : null,
          outcomeNotes: data.notes,
        }),
      });

      if (!response.ok) throw new Error("Failed to submit outcome");

      setStep("success");
      setTimeout(() => {
        onOpenChange(false);
      }, 2000);
    } catch (error) {
      console.error("Error submitting outcome:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    if (step === "quick") {
      onOpenChange(false);
    } else if (step === "detailed") {
      setStep("success");
      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    } else if (step === "outcome") {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "quick" && (
          <>
            <DialogHeader>
              <DialogTitle className="text-center">
                Was this recommendation helpful?
              </DialogTitle>
              <DialogDescription className="text-center">
                Your feedback directly improves future recommendations
              </DialogDescription>
            </DialogHeader>

            <div className="flex justify-center gap-6 py-8">
              <button
                onClick={() => handleQuickFeedback(true)}
                disabled={loading}
                className={cn(
                  "flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all hover:scale-105",
                  "hover:border-green-400 hover:bg-green-50",
                  loading && "opacity-50 pointer-events-none"
                )}
              >
                <ThumbsUp className="h-12 w-12 text-green-500" />
                <span className="font-medium text-green-700">Yes</span>
              </button>

              <button
                onClick={() => handleQuickFeedback(false)}
                disabled={loading}
                className={cn(
                  "flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all hover:scale-105",
                  "hover:border-red-400 hover:bg-red-50",
                  loading && "opacity-50 pointer-events-none"
                )}
              >
                <ThumbsDown className="h-12 w-12 text-red-500" />
                <span className="font-medium text-red-700">No</span>
              </button>
            </div>

            <button
              onClick={handleSkip}
              className="text-sm text-gray-400 hover:text-gray-600 text-center"
            >
              Maybe later
            </button>
          </>
        )}

        {step === "detailed" && (
          <>
            <DialogHeader>
              <DialogTitle>Rate this recommendation</DialogTitle>
              <DialogDescription>
                Your ratings help us improve recommendations for everyone
              </DialogDescription>
            </DialogHeader>

            <p className="text-xs text-center text-gray-500 -mt-2 mb-2">
              Takes less than 30 seconds
            </p>

            <Form {...detailedForm}>
              <form
                onSubmit={detailedForm.handleSubmit(handleDetailedSubmit)}
                className="space-y-5"
              >
                {/* Overall Rating */}
                <FormField
                  control={detailedForm.control}
                  name="rating"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Overall Rating</FormLabel>
                      <FormControl>
                        <StarRating
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Accuracy Rating */}
                <FormField
                  control={detailedForm.control}
                  name="accuracy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Diagnosis Accuracy</FormLabel>
                      <FormControl>
                        <StarRating
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Issues */}
                <FormField
                  control={detailedForm.control}
                  name="issues"
                  render={() => (
                    <FormItem>
                      <FormLabel>What could be improved?</FormLabel>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {issueOptions.map((option) => (
                          <FormField
                            key={option.id}
                            control={detailedForm.control}
                            name="issues"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(option.id)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([
                                            ...(field.value || []),
                                            option.id,
                                          ])
                                        : field.onChange(
                                            field.value?.filter(
                                              (v) => v !== option.id
                                            )
                                          );
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="text-xs font-normal cursor-pointer">
                                  {option.label}
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </FormItem>
                  )}
                />

                {/* Comments */}
                <FormField
                  control={detailedForm.control}
                  name="comments"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comments (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any additional feedback..."
                          className="resize-none h-20"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex gap-3 pt-2">
                  <Button type="submit" className="flex-1" disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Submit"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleSkip}
                    disabled={loading}
                  >
                    Skip
                  </Button>
                </div>
              </form>
            </Form>
          </>
        )}

        {step === "outcome" && (
          <>
            <DialogHeader>
              <DialogTitle>How did it go?</DialogTitle>
              <DialogDescription>
                Follow up on this recommendation from {daysSinceCreation} days ago
              </DialogDescription>
            </DialogHeader>

            <p className="text-xs text-center text-gray-500 -mt-2 mb-2">
              Real-world outcomes help us learn what works best
            </p>

            <Form {...outcomeForm}>
              <form
                onSubmit={outcomeForm.handleSubmit(handleOutcomeSubmit)}
                className="space-y-5"
              >
                {/* Did you apply? */}
                <FormField
                  control={outcomeForm.control}
                  name="applied"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Did you apply this recommendation?</FormLabel>
                      <FormControl>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => field.onChange("yes")}
                            className={cn(
                              "flex-1 p-3 border rounded-xl text-center transition-all",
                              field.value === "yes"
                                ? "border-green-500 bg-green-50 ring-2 ring-green-200"
                                : "border-gray-200 hover:border-gray-300"
                            )}
                          >
                            <span className="font-medium">Yes</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => field.onChange("no")}
                            className={cn(
                              "flex-1 p-3 border rounded-xl text-center transition-all",
                              field.value === "no"
                                ? "border-gray-500 bg-gray-50 ring-2 ring-gray-200"
                                : "border-gray-200 hover:border-gray-300"
                            )}
                          >
                            <span className="font-medium">No</span>
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Success level - only show if applied */}
                {appliedValue === "yes" && (
                  <FormField
                    control={outcomeForm.control}
                    name="success"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Did it work?</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => field.onChange("yes")}
                              className={cn(
                                "w-full flex items-center gap-3 p-3 border rounded-xl text-left transition-all",
                                field.value === "yes"
                                  ? "border-green-500 bg-green-50 ring-2 ring-green-200"
                                  : "border-gray-200 hover:border-gray-300"
                              )}
                            >
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                              <span className="font-medium">Yes, it worked</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => field.onChange("partial")}
                              className={cn(
                                "w-full flex items-center gap-3 p-3 border rounded-xl text-left transition-all",
                                field.value === "partial"
                                  ? "border-yellow-500 bg-yellow-50 ring-2 ring-yellow-200"
                                  : "border-gray-200 hover:border-gray-300"
                              )}
                            >
                              <MinusCircle className="h-5 w-5 text-yellow-500" />
                              <span className="font-medium">Partially worked</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => field.onChange("no")}
                              className={cn(
                                "w-full flex items-center gap-3 p-3 border rounded-xl text-left transition-all",
                                field.value === "no"
                                  ? "border-red-500 bg-red-50 ring-2 ring-red-200"
                                  : "border-gray-200 hover:border-gray-300"
                              )}
                            >
                              <XCircle className="h-5 w-5 text-red-500" />
                              <span className="font-medium">No, it did not work</span>
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Notes */}
                <FormField
                  control={outcomeForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {appliedValue === "yes"
                          ? "What happened?"
                          : "Why not?"}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={
                            appliedValue === "yes"
                              ? "Describe the results..."
                              : "What prevented you from applying it?"
                          }
                          className="resize-none h-24"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Your experience helps us improve recommendations
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-3 pt-2">
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={loading || !appliedValue}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Submit"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleSkip}
                    disabled={loading}
                  >
                    Later
                  </Button>
                </div>
              </form>
            </Form>
          </>
        )}

        {step === "success" && (
          <div className="py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <DialogTitle className="mb-2">Thank you!</DialogTitle>
            <DialogDescription>
              Your feedback helps us improve recommendations for everyone.
            </DialogDescription>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Star Rating Component
function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [hoverValue, setHoverValue] = useState(0);

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHoverValue(star)}
          onMouseLeave={() => setHoverValue(0)}
          className="transition-transform hover:scale-110 focus:outline-none"
        >
          <Star
            className={`h-8 w-8 ${
              star <= (hoverValue || value)
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
