"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Star, Loader2, CheckCircle2 } from "lucide-react";

const feedbackSchema = z.object({
  rating: z.number().min(1, "Please provide an overall rating").max(5),
  accuracy: z.number().min(1, "Please rate the diagnosis accuracy").max(5),
  comments: z.string().optional(),
  issues: z.array(z.string()).optional(),
});

type FeedbackFormData = z.infer<typeof feedbackSchema>;

interface DetailedFeedbackFormProps {
  recommendationId: string;
  onSubmit?: () => void;
  defaultExpanded?: boolean;
}

const issueOptions = [
  { id: "diagnosis_wrong", label: "Diagnosis was incorrect" },
  { id: "not_practical", label: "Recommendations not practical" },
  { id: "products_unavailable", label: "Suggested products not available" },
  { id: "timing_off", label: "Timing was wrong" },
  { id: "missing_info", label: "Missing important information" },
  { id: "other", label: "Other (please describe in comments)" },
];

export function DetailedFeedbackForm({
  recommendationId,
  onSubmit: onSubmitCallback,
  defaultExpanded = false,
}: DetailedFeedbackFormProps) {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const form = useForm<FeedbackFormData>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      rating: 0,
      accuracy: 0,
      comments: "",
      issues: [],
    },
  });

  const onSubmit = async (data: FeedbackFormData) => {
    setLoading(true);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationId,
          ...data,
        }),
      });

      if (!response.ok) throw new Error("Failed to submit feedback");

      setSubmitted(true);
      form.reset();
      if (onSubmitCallback) onSubmitCallback();
    } catch (error) {
      console.error("Error submitting feedback:", error);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Thank you for your feedback!</h3>
            <p className="text-gray-600 mb-4">
              Your input helps us improve recommendations for everyone.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSubmitted(false)}
            >
              Submit More Feedback
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!expanded) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Want to provide more details?</h3>
              <p className="text-sm text-gray-500">
                Help us improve by rating this recommendation
              </p>
            </div>
            <Button variant="outline" onClick={() => setExpanded(true)}>
              Rate & Review
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detailed Feedback</CardTitle>
        <CardDescription>
          Help us improve by providing detailed feedback on this recommendation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Overall Rating */}
            <FormField
              control={form.control}
              name="rating"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Overall Rating</FormLabel>
                  <FormControl>
                    <StarRating
                      value={field.value}
                      onChange={field.onChange}
                      label="How would you rate this recommendation overall?"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Accuracy Rating */}
            <FormField
              control={form.control}
              name="accuracy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Diagnosis Accuracy</FormLabel>
                  <FormControl>
                    <StarRating
                      value={field.value}
                      onChange={field.onChange}
                      label="How accurate was the diagnosis?"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Issues Checkboxes */}
            <FormField
              control={form.control}
              name="issues"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel>What could be improved?</FormLabel>
                    <FormDescription>Select all that apply</FormDescription>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {issueOptions.map((option) => (
                      <FormField
                        key={option.id}
                        control={form.control}
                        name="issues"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={option.id}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
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
                                            (value) => value !== option.id
                                          )
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal text-sm cursor-pointer">
                                {option.label}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Comments */}
            <FormField
              control={form.control}
              name="comments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Comments (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tell us more about your experience with this recommendation..."
                      className="min-h-[100px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Your feedback helps us improve recommendations for everyone
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Feedback"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setExpanded(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// Star Rating Component
function StarRating({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}) {
  const [hoverValue, setHoverValue] = useState(0);

  const getRatingText = (rating: number) => {
    if (rating === 0) return "Click to rate";
    if (rating === 1) return "Poor";
    if (rating === 2) return "Fair";
    if (rating === 3) return "Good";
    if (rating === 4) return "Very Good";
    if (rating === 5) return "Excellent";
    return "";
  };

  return (
    <div className="space-y-2">
      {label && <p className="text-sm text-gray-500">{label}</p>}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHoverValue(star)}
            onMouseLeave={() => setHoverValue(0)}
            className="transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400 rounded"
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
      <p className="text-sm text-gray-500">{getRatingText(hoverValue || value)}</p>
    </div>
  );
}
