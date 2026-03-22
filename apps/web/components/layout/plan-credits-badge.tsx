"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Coins, ExternalLink, Info, Loader2, Sparkles, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getBrowserApiBase } from "@/lib/api-client";
import { onCreditsRefresh } from "@/lib/credits-events";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Tier = "grower_free" | "grower" | "grower_pro";

interface SubscriptionSnapshot {
  planId: Tier;
  planName: string;
  status: "active" | "trialing" | "past_due" | "canceled";
  includedRecommendations: number;
  priceUsd: number;
  currentPeriodEnd: string;
}

interface UsageSnapshot {
  remainingRecommendations: number;
  creditsBalanceUsd: number;
  overagePriceUsd: number;
}

interface AutoReloadConfig {
  enabled: boolean;
  thresholdUsd: number;
  monthlyLimitUsd: number;
  reloadPackId: string;
}

type SaveState = "idle" | "saving" | "saved";

const REFRESH_INTERVAL_MS = 15_000;
const DEBOUNCE_MS = 600;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatAgo(timestamp: number): string {
  const elapsed = Date.now() - timestamp;
  const mins = Math.floor(elapsed / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface PlanCreditsBadgeProps {
  placement?: "floating" | "sidebar" | "sidebar-collapsed";
}

export function PlanCreditsBadge({ placement = "floating" }: PlanCreditsBadgeProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(Date.now());
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [autoReloadEnabled, setAutoReloadEnabled] = useState(false);
  const [thresholdUsd, setThresholdUsd] = useState("5");
  const [monthlyLimit, setMonthlyLimit] = useState("60");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [promoCode, setPromoCode] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getAuthToken = useCallback(async (): Promise<string> => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }, []);

  const persistAutoReload = useCallback(
    async (patch: Partial<{ enabled: boolean; thresholdUsd: number; monthlyLimitUsd: number }>) => {
      setSaveState("saving");
      try {
        const token = await getAuthToken();
        const base = getBrowserApiBase();
        await fetch(`${base}/api/v1/credits/auto-reload-config`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2000);
      } catch {
        setSaveState("idle");
      }
    },
    [getAuthToken]
  );

  const scheduleSave = useCallback(
    (patch: Partial<{ enabled: boolean; thresholdUsd: number; monthlyLimitUsd: number }>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void persistAutoReload(patch);
      }, DEBOUNCE_MS);
    },
    [persistAutoReload]
  );

  const handleToggleAutoReload = useCallback(() => {
    setAutoReloadEnabled((prev) => {
      const next = !prev;
      void persistAutoReload({ enabled: next });
      return next;
    });
  }, [persistAutoReload]);

  const handleThresholdChange = useCallback(
    (value: string) => {
      setThresholdUsd(value);
      const num = parseFloat(value);
      if (Number.isFinite(num) && num >= 1 && num <= 50) {
        scheduleSave({ thresholdUsd: num });
      }
    },
    [scheduleSave]
  );

  const handleMonthlyLimitChange = useCallback(
    (value: string) => {
      setMonthlyLimit(value);
      const num = parseFloat(value);
      if (Number.isFinite(num) && num >= 12 && num <= 500) {
        scheduleSave({ monthlyLimitUsd: num });
      }
    },
    [scheduleSave]
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = await getAuthToken();
      const base = getBrowserApiBase();

      const [subRes, usageRes, configRes] = await Promise.all([
        fetch(`${base}/api/v1/subscription`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch(`${base}/api/v1/usage`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch(`${base}/api/v1/credits/auto-reload-config`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);

      if (subRes.ok) {
        const body = (await subRes.json()) as { subscription?: SubscriptionSnapshot };
        if (body.subscription) setSubscription(body.subscription);
      }
      if (usageRes.ok) {
        const body = (await usageRes.json()) as { usage?: UsageSnapshot };
        if (body.usage) setUsage(body.usage);
      }
      if (configRes.ok) {
        const body = (await configRes.json()) as { config?: AutoReloadConfig };
        if (body.config) {
          setAutoReloadEnabled(body.config.enabled);
          setThresholdUsd(String(body.config.thresholdUsd));
          setMonthlyLimit(String(body.config.monthlyLimitUsd));
        }
      }
      setLastUpdatedAt(Date.now());
    } catch {
      // Keep badge resilient; this should not block app interaction.
    } finally {
      setIsLoading(false);
    }
  }, [getAuthToken]);

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    const unbind = onCreditsRefresh(() => void load());

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      unbind();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [load]);

  const isPaidPlan = subscription?.planId === "grower" || subscription?.planId === "grower_pro";
  const isBalanceLow = usage ? usage.creditsBalanceUsd < usage.overagePriceUsd : false;
  const isOutOfCapacity = usage
    ? usage.remainingRecommendations === 0 && isBalanceLow
    : false;

  const purchasedCreditsAsRecs = useMemo(() => {
    if (!usage || usage.overagePriceUsd <= 0) return 0;
    return Math.floor(usage.creditsBalanceUsd / usage.overagePriceUsd);
  }, [usage]);

  const totalRecommendationsLeft = useMemo(() => {
    if (!usage) return null;
    return Math.max(0, usage.remainingRecommendations + purchasedCreditsAsRecs);
  }, [purchasedCreditsAsRecs, usage]);

  const triggerClassName = useMemo(() => {
    if (placement === "sidebar") {
      return cn(
        "inline-flex h-8 max-w-[6.75rem] items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold transition",
        isOutOfCapacity
          ? "border-amber-400/30 bg-amber-900/40 text-amber-300 hover:bg-amber-900/60"
          : "border-lime-400/25 bg-earth-900/85 text-lime-300 hover:bg-earth-900"
      );
    }
    if (placement === "sidebar-collapsed") {
      return cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-lg border transition",
        isOutOfCapacity
          ? "border-amber-400/30 bg-amber-900/40 text-amber-300 hover:bg-amber-900/60"
          : "border-lime-400/25 bg-earth-900/85 text-lime-300 hover:bg-earth-900"
      );
    }
    return cn(
      "fixed top-4 right-4 z-50 flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-sm shadow-lg shadow-black/40 backdrop-blur-sm transition",
      isOutOfCapacity
        ? "border-amber-400/40 bg-amber-400/15 text-amber-100 hover:bg-amber-400/25"
        : "border-lime-400/40 bg-lime-400/15 text-lime-100 hover:bg-lime-400/25"
    );
  }, [placement, isOutOfCapacity]);

  if (!subscription || !usage) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={cn(triggerClassName, placement !== "floating" && "w-auto")}>
          {placement === "floating" && <span className="hidden sm:inline font-semibold">Credit Balance</span>}
          {placement === "sidebar" && (
            <span className="truncate font-semibold tabular-nums leading-none">
              {isPaidPlan ? formatCurrency(usage.creditsBalanceUsd) : `${usage.remainingRecommendations} left`}
            </span>
          )}
          {placement === "floating" && (
            <span className="opacity-85">
              {isPaidPlan ? formatCurrency(usage.creditsBalanceUsd) : `${usage.remainingRecommendations} left`}
            </span>
          )}
          <span className="inline-flex items-center justify-center rounded-full border border-current/40 p-1">
            {isOutOfCapacity ? <AlertTriangle className="h-3 w-3" /> : <Coins className="h-3 w-3" />}
          </span>
          {placement !== "floating" && (
            <span className="sr-only">
              Credit balance {formatCurrency(usage.creditsBalanceUsd)} with{" "}
              {totalRecommendationsLeft ?? usage.remainingRecommendations} recommendation uses left
            </span>
          )}
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl border border-lime-400/20 bg-earth-950 text-white shadow-2xl">
        <DialogHeader className="pb-1">
          <DialogTitle className="flex items-center justify-between text-base font-medium text-white">
            <span>Credits</span>
            <span className="text-sm font-normal text-white/60">
              Last updated {formatAgo(lastUpdatedAt)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Low-balance warning */}
          {isOutOfCapacity && !autoReloadEnabled && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-200">
                Balance too low to continue. Enable auto reload or{" "}
                <Link href="/settings/billing" className="underline" onClick={() => setOpen(false)}>
                  buy more credits
                </Link>
                .
              </p>
            </div>
          )}

          {/* Balance + Plan cards */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-lime-400/25 bg-lime-400/10 p-5">
              <div className="flex items-center justify-between text-lime-200">
                <span className="text-sm">{isPaidPlan ? "Credit balance" : "Monthly usage"}</span>
                <Wallet className="h-4 w-4" />
              </div>
              <p className="mt-2 text-5xl font-semibold tracking-tight">
                {isPaidPlan ? formatCurrency(usage.creditsBalanceUsd) : `${usage.remainingRecommendations}`}
              </p>
              <p className="mt-2 text-xs text-lime-100/85">
                {isPaidPlan
                  ? `${usage.remainingRecommendations} monthly recs left + ${purchasedCreditsAsRecs} recs from credit balance.`
                  : `recommendations remaining this month`}
              </p>
              <Button asChild className="mt-4 w-full bg-lime-400 text-earth-950 hover:bg-lime-300">
                <Link href="/settings/billing" onClick={() => setOpen(false)}>
                  {isPaidPlan ? "Buy more" : "Upgrade plan"}
                </Link>
              </Button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-earth-900/60 p-5">
              <p className="text-sm text-white/60">Your plan</p>
              <p className="mt-2 text-5xl font-semibold tracking-tight">
                {subscription.planId === "grower_pro" ? "Pro" : "Grower"}
              </p>
              <p className="mt-2 text-sm text-white/65">
                {subscription.includedRecommendations} recommendations / month
              </p>
              <Button
                asChild
                variant="secondary"
                className="mt-4 w-full bg-white/10 text-white hover:bg-white/20"
              >
                <Link href="/settings/billing" onClick={() => setOpen(false)}>
                  Compare plans
                </Link>
              </Button>
            </div>
          </div>

          <p className="text-center text-sm text-white/60">
            Your next credits period resets on{" "}
            <span className="text-white">{formatDate(subscription.currentPeriodEnd)}</span>.
          </p>

          <div className="h-px bg-white/10" />

          {/* Auto-reload settings — paid plans only */}
          {isPaidPlan && <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white/80">Auto Reload</p>
              {saveState === "saving" && (
                <span className="flex items-center gap-1 text-xs text-white/40">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              )}
              {saveState === "saved" && (
                <span className="flex items-center gap-1 text-xs text-lime-400">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-earth-900/50 px-4 py-3">
              <div>
                <p className="text-base font-medium text-white">Enable Auto Reload</p>
                <p className="text-xs text-white/60">Automatically charge your card when balance runs low.</p>
              </div>
              <button
                type="button"
                onClick={handleToggleAutoReload}
                className={`relative h-9 w-16 rounded-full transition ${
                  autoReloadEnabled ? "bg-lime-400/60" : "bg-white/20"
                }`}
              >
                <span
                  className={`absolute top-1 h-7 w-7 rounded-full bg-white transition-all ${
                    autoReloadEnabled ? "left-8" : "left-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-earth-900/50 px-4 py-3">
              <div>
                <p className="text-base font-medium text-white">Reload threshold</p>
                <p className="text-xs text-white/60">Reload when balance drops below this amount.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/60">$</span>
                <Input
                  value={thresholdUsd}
                  onChange={(e) => handleThresholdChange(e.target.value)}
                  disabled={!autoReloadEnabled}
                  className="h-9 w-20 border-white/20 bg-earth-950 text-right text-white disabled:opacity-60"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-earth-900/50 px-4 py-3">
              <div>
                <p className="text-base font-medium text-white">Monthly limit</p>
                <p className="text-xs text-white/60">Cap automatic reload spend per month.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/60">$</span>
                <Input
                  value={monthlyLimit}
                  onChange={(e) => handleMonthlyLimitChange(e.target.value)}
                  disabled={!autoReloadEnabled}
                  className="h-9 w-24 border-white/20 bg-earth-950 text-right text-white disabled:opacity-60"
                />
              </div>
            </div>
          </div>}

          <div className="h-px bg-white/10" />

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-earth-900/50 px-3 py-2">
              <Input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="Redeem promo code"
                className="h-9 border-transparent bg-transparent text-white focus-visible:ring-0"
              />
              <Info className="h-4 w-4 text-white/40" />
            </div>
            <Button asChild className="h-11 bg-lime-400 text-earth-950 hover:bg-lime-300">
              <Link href="/settings/billing" onClick={() => setOpen(false)}>
                Get more credits
                <ExternalLink className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>

          <div className="flex items-center justify-between text-xs text-white/50">
            <span className="flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              Live updates after billing, usage, and reward events
            </span>
            <span>
              {isLoading ? "Refreshing..." : `${totalRecommendationsLeft ?? 0} recommendation uses left`}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
