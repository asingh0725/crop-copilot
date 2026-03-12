"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface ComplianceAutoRefreshProps {
  intervalMs?: number;
}

function formatLocalTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ComplianceAutoRefresh({ intervalMs = 30_000 }: ComplianceAutoRefreshProps) {
  const router = useRouter();
  const [lastRefreshAt, setLastRefreshAt] = useState<Date>(new Date());
  const [countdownMs, setCountdownMs] = useState(intervalMs);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdownMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (countdownMs > 0) return;
    router.refresh();
    setLastRefreshAt(new Date());
    setCountdownMs(intervalMs);
  }, [countdownMs, intervalMs, router]);

  const secondsRemaining = useMemo(() => Math.ceil(countdownMs / 1000), [countdownMs]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Live refresh every {Math.round(intervalMs / 1000)}s</span>
      <span>·</span>
      <span>Last refresh {formatLocalTime(lastRefreshAt)}</span>
      <span>·</span>
      <span>Next in {secondsRemaining}s</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => {
          router.refresh();
          setLastRefreshAt(new Date());
          setCountdownMs(intervalMs);
        }}
      >
        Refresh now
      </Button>
    </div>
  );
}
