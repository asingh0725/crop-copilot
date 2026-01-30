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
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const outcomeSchema = z.object({
  applied: z.enum(["yes", "no"]),
  success: z.enum(["yes", "no", "partial"]).optional(),
  notes: z.string().min(10, "Please provide some details (at least 10 characters)"),
});

type OutcomeFormData = z.infer<typeof outcomeSchema>;

interface OutcomeReporterProps {
  recommendationId: string;
  onSubmit?: () => void;
}

export function OutcomeReporter({
  recommendationId,
  onSubmit: onSubmitCallback,
}: OutcomeReporterProps) {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const form = useForm<OutcomeFormData>({
    resolver: zodResolver(outcomeSchema),
    defaultValues: {
      applied: undefined,
      success: undefined,
      notes: "",
    },
  });

  const applied = form.watch("applied");

  const onSubmit = async (data: OutcomeFormData) => {
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

      setSubmitted(true);
      form.reset();
      if (onSubmitCallback) onSubmitCallback();
    } catch (error) {
      console.error("Error submitting outcome:", error);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="py-8">
          <div className="flex flex-col items-center text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Thank you for reporting the outcome!</h3>
            <p className="text-gray-600">
              Your real-world experience helps us learn and improve recommendations.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-gray-500" />
            <div>
              <CardTitle className="text-lg">Follow-up: How did it go?</CardTitle>
              <CardDescription>
                Report your outcome after applying this recommendation
              </CardDescription>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Did you apply the recommendation? */}
              <FormField
                control={form.control}
                name="applied"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Did you apply this recommendation?</FormLabel>
                    <FormControl>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => field.onChange("yes")}
                          className={cn(
                            "flex-1 p-4 border rounded-lg text-left transition-all",
                            field.value === "yes"
                              ? "border-green-500 bg-green-50 ring-2 ring-green-200"
                              : "border-gray-200 hover:border-gray-300"
                          )}
                        >
                          <div className="font-medium">Yes, I applied it</div>
                          <div className="text-sm text-gray-500">
                            I followed the recommendations
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => field.onChange("no")}
                          className={cn(
                            "flex-1 p-4 border rounded-lg text-left transition-all",
                            field.value === "no"
                              ? "border-gray-500 bg-gray-50 ring-2 ring-gray-200"
                              : "border-gray-200 hover:border-gray-300"
                          )}
                        >
                          <div className="font-medium">No, I did not</div>
                          <div className="text-sm text-gray-500">
                            I did not follow through
                          </div>
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* If applied, did it work? */}
              {applied === "yes" && (
                <FormField
                  control={form.control}
                  name="success"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Did it work?</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => field.onChange("yes")}
                            className={cn(
                              "w-full flex items-center gap-3 p-4 border rounded-lg text-left transition-all",
                              field.value === "yes"
                                ? "border-green-500 bg-green-50 ring-2 ring-green-200"
                                : "border-gray-200 hover:border-gray-300"
                            )}
                          >
                            <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
                            <div>
                              <div className="font-medium">Yes, it worked</div>
                              <div className="text-sm text-gray-500">
                                The problem was resolved
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => field.onChange("partial")}
                            className={cn(
                              "w-full flex items-center gap-3 p-4 border rounded-lg text-left transition-all",
                              field.value === "partial"
                                ? "border-yellow-500 bg-yellow-50 ring-2 ring-yellow-200"
                                : "border-gray-200 hover:border-gray-300"
                            )}
                          >
                            <MinusCircle className="h-6 w-6 text-yellow-500 shrink-0" />
                            <div>
                              <div className="font-medium">Partially worked</div>
                              <div className="text-sm text-gray-500">
                                Some improvement but not fully resolved
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => field.onChange("no")}
                            className={cn(
                              "w-full flex items-center gap-3 p-4 border rounded-lg text-left transition-all",
                              field.value === "no"
                                ? "border-red-500 bg-red-50 ring-2 ring-red-200"
                                : "border-gray-200 hover:border-gray-300"
                            )}
                          >
                            <XCircle className="h-6 w-6 text-red-500 shrink-0" />
                            <div>
                              <div className="font-medium">No, it did not work</div>
                              <div className="text-sm text-gray-500">
                                The problem persisted or got worse
                              </div>
                            </div>
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Outcome notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {applied === "yes"
                        ? "What happened? (Details help us improve)"
                        : "Why didn't you apply it?"}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={
                          applied === "yes"
                            ? "e.g., Applied UAN 32-0-0 at 50 lbs/acre on June 15. Corn greened up within 7 days. Yield estimate improved by 15-20 bu/acre..."
                            : "e.g., Products not available locally, waited too long to act, tried different approach..."
                        }
                        className="min-h-[120px] resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Your experience helps us learn what works in real-world conditions
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={loading || !applied}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Outcome Report"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      )}
    </Card>
  );
}
