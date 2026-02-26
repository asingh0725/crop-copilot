"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Coins, ExternalLink, Info, Sparkles, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getBrowserApiBase } from "@/lib/api-client";
import { onCreditsRefresh } from "@/lib/credits-events";
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

const REFRESH_INTERVAL_MS = 15_000;

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

export function PlanCreditsBadge() {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(Date.now());
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [autoReloadEnabled, setAutoReloadEnabled] = useState(false);
  const [monthlyLimit, setMonthlyLimit] = useState("200");
  const [promoCode, setPromoCode] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const base = getBrowserApiBase();

      const [subRes, usageRes] = await Promise.all([
        fetch(`${base}/api/v1/subscription`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch(`${base}/api/v1/usage`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);

      if (subRes.ok) {
        const subBody = (await subRes.json()) as { subscription?: SubscriptionSnapshot };
        if (subBody.subscription) {
          setSubscription(subBody.subscription);
        }
      }
      if (usageRes.ok) {
        const usageBody = (await usageRes.json()) as { usage?: UsageSnapshot };
        if (usageBody.usage) {
          setUsage(usageBody.usage);
        }
      }
      setLastUpdatedAt(Date.now());
    } catch {
      // Keep badge resilient; this should not block app interaction.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const unbind = onCreditsRefresh(() => {
      void load();
    });

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      unbind();
    };
  }, [load]);

  const isPaidPlan =
    subscription?.planId === "grower" || subscription?.planId === "grower_pro";

  const purchasedCreditsAsRecs = useMemo(() => {
    if (!usage || usage.overagePriceUsd <= 0) return 0;
    return Math.floor(usage.creditsBalanceUsd / usage.overagePriceUsd);
  }, [usage]);

  const totalCreditsLeft = useMemo(() => {
    if (!usage) return null;
    return Math.max(0, usage.remainingRecommendations + purchasedCreditsAsRecs);
  }, [purchasedCreditsAsRecs, usage]);

  const creditPillLabel = useMemo(() => {
    if (!usage) return "0 credits";
    const total = totalCreditsLeft ?? usage.remainingRecommendations;
    return `${total} credits`;
  }, [totalCreditsLeft, usage]);

  if (!isPaidPlan || !subscription || !usage) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="fixed top-4 right-4 z-50 hidden md:flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-100 shadow-lg shadow-black/40 backdrop-blur-sm transition hover:bg-emerald-500/30"
        >
          <span className="font-semibold">{creditPillLabel}</span>
          <span className="text-emerald-100/80">{formatCurrency(usage.creditsBalanceUsd)}</span>
          <span className="inline-flex items-center justify-center rounded-full border border-emerald-300/50 p-1">
            <Coins className="h-3 w-3" />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl border border-white/10 bg-[#151515] text-white shadow-2xl">
        <DialogHeader className="pb-1">
          <DialogTitle className="flex items-center justify-between text-base font-medium text-zinc-100">
            <span>Credits</span>
            <span className="text-sm font-normal text-zinc-400">
              Last updated {formatAgo(lastUpdatedAt)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/25 p-5">
              <div className="flex items-center justify-between text-emerald-200">
                <span className="text-sm">Credit balance</span>
                <Wallet className="h-4 w-4" />
              </div>
              <p className="mt-2 text-5xl font-semibold tracking-tight">
                {formatCurrency(usage.creditsBalanceUsd)}
              </p>
              <p className="mt-2 text-xs text-emerald-100/80">
                {usage.remainingRecommendations} monthly recs left + {purchasedCreditsAsRecs} purchased recs.
              </p>
              <Button
                asChild
                className="mt-4 w-full bg-emerald-900/50 hover:bg-emerald-900/70 text-emerald-50"
              >
                <Link href="/settings/billing" onClick={() => setOpen(false)}>
                  Buy more
                </Link>
              </Button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-zinc-400">Your plan</p>
              <p className="mt-2 text-5xl font-semibold tracking-tight">
                {subscription.planId === "grower_pro" ? "Pro" : "Grower"}
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                {subscription.includedRecommendations} recommendations / month
              </p>
              <Button
                asChild
                variant="secondary"
                className="mt-4 w-full bg-white/10 text-zinc-100 hover:bg-white/20"
              >
                <Link href="/settings/billing" onClick={() => setOpen(false)}>
                  Compare plans
                </Link>
              </Button>
            </div>
          </div>

          <p className="text-center text-sm text-zinc-400">
            Your next credits period resets on{" "}
            <span className="text-zinc-100">{formatDate(subscription.currentPeriodEnd)}</span>.
          </p>

          <div className="h-px bg-white/10" />

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <p className="text-xl font-medium text-zinc-100">Enable Auto Reload</p>
                <p className="text-xs text-zinc-400">Automatically buy credits when balance runs low.</p>
              </div>
              <button
                type="button"
                onClick={() => setAutoReloadEnabled((prev) => !prev)}
                className={`relative h-9 w-16 rounded-full transition ${
                  autoReloadEnabled ? "bg-emerald-500/70" : "bg-zinc-500/40"
                }`}
              >
                <span
                  className={`absolute top-1 h-7 w-7 rounded-full bg-white transition ${
                    autoReloadEnabled ? "left-8" : "left-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <p className="text-lg font-medium text-zinc-100">Monthly limit</p>
                <p className="text-xs text-zinc-400">Cap automatic reload spend per month.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">$</span>
                <Input
                  value={monthlyLimit}
                  onChange={(event) => setMonthlyLimit(event.target.value)}
                  disabled={!autoReloadEnabled}
                  className="h-9 w-24 border-white/15 bg-black/30 text-right text-zinc-100 disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-white/10" />

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <Input
                value={promoCode}
                onChange={(event) => setPromoCode(event.target.value)}
                placeholder="Redeem promo code"
                className="h-9 border-transparent bg-transparent text-zinc-100 focus-visible:ring-0"
              />
              <Info className="h-4 w-4 text-zinc-500" />
            </div>
            <Button asChild className="h-11 bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
              <Link href="/settings/billing" onClick={() => setOpen(false)}>
                Get more credits
                <ExternalLink className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              Live updates after billing, usage, and reward events
            </span>
            <span>
              {isLoading ? "Refreshing..." : `${totalCreditsLeft ?? 0} total recommendation credits left`}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
