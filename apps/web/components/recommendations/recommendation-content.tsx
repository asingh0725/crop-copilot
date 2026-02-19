"use client";

import { useMemo, useState, useCallback } from "react";
import { ActionItemsDisplay } from "./action-items-display";
import { SourcesPanel } from "./sources-panel";
import { SourcesDisplay } from "./sources-display";
import { ProductSuggestions } from "./product-suggestions";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
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
}

export function RecommendationContent({
  actionItems,
  sources,
  products,
}: RecommendationContentProps) {
  const [isSourcesPanelOpen, setIsSourcesPanelOpen] = useState(false);
  const [highlightedSourceNumber, setHighlightedSourceNumber] = useState<number | null>(null);

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

      {/* Product Suggestions from diagnosis */}
      {products && products.length > 0 && (
        <ProductSuggestions products={products} />
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
