"use client";

import { useMemo, useState, useCallback } from "react";
import { ActionItemsDisplay } from "./action-items-display";
import { SourcesPanel } from "./sources-panel";
import { SourcesDisplay } from "./sources-display";
import { ProductSuggestions } from "./product-suggestions";
import { ProductRecommendations } from "./product-recommendations";
import { Button } from "@/components/ui/button";
import { BookOpen, ThumbsDown, ThumbsUp } from "lucide-react";
import type { ActionItem, ProductSuggestion } from "@/lib/utils/format-diagnosis";

interface Source {
  id: string;
  chunkId: string | null;
  type: string;
  content?: string | null;
  imageUrl?: string | null;
  relevanceScore: number | null;
  source: {
    id: string;
    title: string;
    type: string;
    url: string | null;
    publisher?: string | null;
    publishedDate?: string | null;
  } | null;
}

interface RecommendationContentProps {
  actionItems: ActionItem[];
  sources: Source[];
  products: ProductSuggestion[];
  recommendationId?: string;
}

export function RecommendationContent({
  actionItems,
  sources,
  products,
  recommendationId,
}: RecommendationContentProps) {
  const [isSourcesPanelOpen, setIsSourcesPanelOpen] = useState(false);
  const [highlightedSourceNumber, setHighlightedSourceNumber] = useState<number | null>(null);
  const [feedbackSelection, setFeedbackSelection] = useState<boolean | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Sort sources by relevance for consistent numbering
  const sortedSources = useMemo(
    () =>
      [...sources].sort(
        (a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0)
      ),
    [sources]
  );

  // Create citation map: chunkId -> source number (1-indexed)
  const citationMap = useMemo(() => {
    const map = new Map<string, number>();
    sortedSources.forEach((source, index) => {
      if (source.chunkId) {
        map.set(source.chunkId, index + 1);
      }
    });
    return map;
  }, [sortedSources]);

  // Create back-reference map: chunkId -> action indices that cite it
  const citedByActions = useMemo(() => {
    const map = new Map<string, number[]>();
    actionItems.forEach((action, actionIndex) => {
      action.citations?.forEach((chunkId) => {
        const existing = map.get(chunkId) || [];
        map.set(chunkId, [...existing, actionIndex]);
      });
    });
    return map;
  }, [actionItems]);

  // Handle citation click - open panel and highlight source
  const handleCitationClick = useCallback((sourceNumber: number) => {
    setHighlightedSourceNumber(sourceNumber);
    setIsSourcesPanelOpen(true);
  }, []);

  // Handle back-reference click - scroll to action
  const handleBackReference = useCallback((actionIndex: number) => {
    setIsSourcesPanelOpen(false);
    // Wait for panel to close, then scroll
    setTimeout(() => {
      const actionElement = document.getElementById(`action-${actionIndex}`);
      if (actionElement) {
        actionElement.scrollIntoView({ behavior: "smooth", block: "center" });
        // Add highlight effect
        actionElement.classList.add("ring-2", "ring-blue-300");
        setTimeout(() => {
          actionElement.classList.remove("ring-2", "ring-blue-300");
        }, 2000);
      }
    }, 300);
  }, []);

  const handleFeedbackSubmit = useCallback(
    async (helpful: boolean) => {
      if (!recommendationId || isSubmittingFeedback) return;

      setIsSubmittingFeedback(true);
      setFeedbackError(null);

      try {
        const response = await fetch("/api/v1/feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            recommendationId,
            helpful,
          }),
        });

        if (!response.ok) {
          throw new Error("Unable to submit feedback");
        }

        setFeedbackSelection(helpful);
      } catch {
        setFeedbackError("Feedback could not be saved. Please try again.");
      } finally {
        setIsSubmittingFeedback(false);
      }
    },
    [recommendationId, isSubmittingFeedback]
  );

  return (
    <>
      {/* Action Items */}
      <ActionItemsDisplay
        actions={actionItems}
        citationMap={citationMap}
        onCitationClick={handleCitationClick}
      />

      {/* View Sources Button */}
      {sources.length > 0 && (
        <div className="flex justify-center print:hidden">
          <Button
            variant="outline"
            onClick={() => setIsSourcesPanelOpen(true)}
            className="gap-2"
          >
            <BookOpen className="h-4 w-4" />
            View Sources ({sources.length})
          </Button>
        </div>
      )}

      {/* Feedback */}
      {recommendationId && (
        <div className="rounded-lg border bg-card p-4 print:hidden">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Was this recommendation helpful?
            </h3>
            <p className="text-xs text-gray-600">
              Your input improves future recommendations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={feedbackSelection === true ? "default" : "outline"}
              onClick={() => handleFeedbackSubmit(true)}
              disabled={isSubmittingFeedback}
              className="gap-2"
            >
              <ThumbsUp className="h-4 w-4" />
              Helpful
            </Button>
            <Button
              type="button"
              variant={feedbackSelection === false ? "default" : "outline"}
              onClick={() => handleFeedbackSubmit(false)}
              disabled={isSubmittingFeedback}
              className="gap-2"
            >
              <ThumbsDown className="h-4 w-4" />
              Not Helpful
            </Button>
          </div>
          {feedbackSelection !== null && !feedbackError && (
            <p className="mt-2 text-xs text-green-700">
              Thanks, feedback saved.
            </p>
          )}
          {feedbackError && (
            <p className="mt-2 text-xs text-red-600">{feedbackError}</p>
          )}
        </div>
      )}

      {/* Product Suggestions from diagnosis */}
      {products && products.length > 0 && (
        <ProductSuggestions products={products} />
      )}

      {/* Dynamic Product Recommendations with live pricing */}
      {recommendationId && (
        <ProductRecommendations recommendationId={recommendationId} />
      )}

      {/* Sources Panel (Sheet/Sidebar) */}
      <SourcesPanel
        sources={sortedSources}
        isOpen={isSourcesPanelOpen}
        onClose={() => {
          setIsSourcesPanelOpen(false);
          setHighlightedSourceNumber(null);
        }}
        highlightedSourceNumber={highlightedSourceNumber}
        citedByActions={citedByActions}
        onBackReference={handleBackReference}
      />

      {/* Print-only Sources Display (inline) */}
      <div className="hidden print:block">
        <SourcesDisplay sources={sources} />
      </div>
    </>
  );
}
