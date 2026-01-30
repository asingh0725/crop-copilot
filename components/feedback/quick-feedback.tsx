"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";

interface QuickFeedbackProps {
  recommendationId: string;
  onExpand?: () => void; // Callback to expand detailed feedback
  onFeedbackChange?: (helpful: boolean | null) => void;
}

export function QuickFeedback({
  recommendationId,
  onExpand,
  onFeedbackChange,
}: QuickFeedbackProps) {
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch existing feedback on mount
  useEffect(() => {
    async function fetchExistingFeedback() {
      try {
        const response = await fetch(
          `/api/feedback?recommendationId=${recommendationId}`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.feedback?.helpful !== null && data.feedback?.helpful !== undefined) {
            setFeedback(data.feedback.helpful);
          }
        }
      } catch (error) {
        console.error("Error fetching existing feedback:", error);
      } finally {
        setInitialLoading(false);
      }
    }

    fetchExistingFeedback();
  }, [recommendationId]);

  const handleFeedback = async (helpful: boolean) => {
    setLoading(true);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationId,
          helpful,
        }),
      });

      if (!response.ok) throw new Error("Failed to submit feedback");

      setFeedback(helpful);
      onFeedbackChange?.(helpful);

      // Auto-expand detailed feedback for negative feedback
      if (!helpful && onExpand) {
        setTimeout(() => {
          onExpand();
        }, 500);
      }
    } catch (error) {
      console.error("Error submitting feedback:", error);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  if (feedback !== null) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        {feedback ? (
          <>
            <ThumbsUp className="h-4 w-4 fill-green-500 text-green-500" />
            <span>Thanks for your feedback!</span>
          </>
        ) : (
          <>
            <ThumbsDown className="h-4 w-4 fill-red-500 text-red-500" />
            <span>Feedback received</span>
          </>
        )}
        <button
          onClick={() => setFeedback(null)}
          className="text-xs text-gray-400 hover:text-gray-600 underline ml-2"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600">Was this helpful?</span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleFeedback(true)}
          disabled={loading}
          className="gap-1.5 hover:bg-green-50 hover:border-green-300 hover:text-green-700"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ThumbsUp className="h-4 w-4" />
          )}
          Yes
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleFeedback(false)}
          disabled={loading}
          className="gap-1.5 hover:bg-red-50 hover:border-red-300 hover:text-red-700"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ThumbsDown className="h-4 w-4" />
          )}
          No
        </Button>
      </div>
    </div>
  );
}
