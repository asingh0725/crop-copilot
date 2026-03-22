"use client";

import { useEffect, useRef, useState } from "react";
import { PremiumInsightPanel } from "./premium-insight-panel";
import type {
  PremiumInsightPanelProps,
  PremiumStatus,
} from "./premium-insight-panel";

type PollablePremiumData = Omit<PremiumInsightPanelProps, "inputContext" | "recommendationId">;

function isTerminal(status: PremiumStatus): boolean {
  return status === "ready" || status === "failed" || status === "not_available";
}

interface PremiumInsightPollerProps {
  recommendationId: string;
  initialData: PollablePremiumData;
  inputContext?: PremiumInsightPanelProps["inputContext"];
}

export function PremiumInsightPoller({
  recommendationId,
  initialData,
  inputContext,
}: PremiumInsightPollerProps) {
  const [data, setData] = useState<PollablePremiumData>(initialData);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isTerminal(data.status)) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/recommendations/${recommendationId}`);
        if (!res.ok) return;
        const json = await res.json();
        const p = json.premium;
        if (!p) return;

        setData({
          status: p.status,
          riskReview: p.riskReview ?? null,
          checks: p.checks ?? [],
          costAnalysis: p.costAnalysis ?? null,
          sprayWindows: p.sprayWindows ?? [],
          report: p.report ?? null,
          advisoryNotice: p.advisoryNotice ?? null,
          failureReason: p.failureReason ?? null,
        });

        if (isTerminal(p.status)) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
        }
      } catch {
        // network error — keep polling
      }
    };

    intervalRef.current = setInterval(poll, 4000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PremiumInsightPanel
      {...data}
      recommendationId={recommendationId}
      inputContext={inputContext}
    />
  );
}
