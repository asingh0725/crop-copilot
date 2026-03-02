"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Gauge, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getBrowserApiBase } from "@/lib/api-client";
import { emitCreditsRefresh } from "@/lib/credits-events";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface SubscriptionSnapshot {
  planId: "grower_free" | "grower" | "grower_pro";
  planName: string;
  status: "active" | "trialing" | "past_due" | "canceled";
  isPro: boolean;
  includedRecommendations: number;
  priceUsd: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface UsageSnapshot {
  month: string;
  usedRecommendations: number;
  includedRecommendations: number;
  remainingRecommendations: number;
  creditsBalanceUsd: number;
  overagePriceUsd: number;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function formatStatus(status: SubscriptionSnapshot["status"]): string {
  return status.replaceAll("_", " ");
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function defaultSubscriptionSnapshot(): SubscriptionSnapshot {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    planId: "grower_free",
    planName: "Grower Free",
    status: "active",
    isPro: false,
    includedRecommendations: 3,
    priceUsd: 0,
    currentPeriodStart: start.toISOString(),
    currentPeriodEnd: end.toISOString(),
    cancelAtPeriodEnd: false,
  };
}

function defaultUsageSnapshot(): UsageSnapshot {
  return {
    month: new Date().toISOString().slice(0, 7),
    usedRecommendations: 0,
    includedRecommendations: 3,
    remainingRecommendations: 3,
    creditsBalanceUsd: 0,
    overagePriceUsd: 1.2,
  };
}

export default function BillingUsagePage() {
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isCreditCheckoutLoading, setIsCreditCheckoutLoading] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);

  const usagePercent = useMemo(() => {
    if (!usage || usage.includedRecommendations <= 0) {
      return 0;
    }
    return Math.min(100, (usage.usedRecommendations / usage.includedRecommendations) * 100);
  }, [usage]);

  const loadBillingState = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const base = getBrowserApiBase();

      const [subscriptionResponse, usageResponse] = await Promise.all([
        fetch(`${base}/api/v1/subscription`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch(`${base}/api/v1/usage`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);

      if (subscriptionResponse.ok) {
        const subscriptionBody = (await subscriptionResponse.json()) as {
          subscription?: SubscriptionSnapshot;
        };
        setSubscription(subscriptionBody.subscription ?? defaultSubscriptionSnapshot());
      } else {
        console.warn("Subscription endpoint failed", {
          status: subscriptionResponse.status,
        });
        setSubscription(defaultSubscriptionSnapshot());
      }

      if (usageResponse.ok) {
        const usageBody = (await usageResponse.json()) as { usage?: UsageSnapshot };
        setUsage(usageBody.usage ?? defaultUsageSnapshot());
      } else {
        console.warn("Usage endpoint failed", {
          status: usageResponse.status,
        });
        setUsage(defaultUsageSnapshot());
      }
    } catch (error) {
      console.error("Failed to load billing and usage", {
        error: (error as Error).message,
      });
      setSubscription(defaultSubscriptionSnapshot());
      setUsage(defaultUsageSnapshot());
      toast.error("Billing API unavailable. Showing fallback plan data.");
    } finally {
      setIsLoading(false);
      emitCreditsRefresh("billing_state_loaded");
    }
  }, []);

  useEffect(() => {
    void loadBillingState();
  }, [loadBillingState]);

  const withSession = useCallback(
    async <T,>(path: string, init: RequestInit): Promise<T> => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const base = getBrowserApiBase();

      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(init.headers ?? {}),
        },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        const message =
          body?.error?.message?.trim() ||
          `Request failed: ${response.status}`;
        throw new Error(message);
      }

      return (await response.json()) as T;
    },
    []
  );

  const handleCheckout = useCallback(async (tier: "grower_free" | "grower" | "grower_pro") => {
    setIsCheckoutLoading(true);
    try {
      const payload = await withSession<{ checkoutUrl: string; mode: "stripe" | "simulation" }>(
        "/api/v1/subscription/checkout",
        {
          method: "POST",
          body: JSON.stringify({
            tier,
            successUrl: `${window.location.origin}/settings/billing`,
            cancelUrl: `${window.location.origin}/settings/billing`,
          }),
        }
      );

      if (payload.mode === "simulation") {
        toast.success("Plan updated in simulation mode.");
        await loadBillingState();
        emitCreditsRefresh("subscription_simulation");
        return;
      }

      if (payload.checkoutUrl) {
        window.location.assign(payload.checkoutUrl);
        return;
      }

      toast.error("Unable to open checkout.");
    } catch (error) {
      console.error("Failed to open checkout", {
        error: (error as Error).message,
      });
      toast.error((error as Error).message || "Failed to open checkout.");
    } finally {
      setIsCheckoutLoading(false);
    }
  }, [loadBillingState, withSession]);

  const handleOpenPortal = useCallback(async () => {
    setIsPortalLoading(true);
    try {
      const payload = await withSession<{ portalUrl: string; mode: "stripe" | "simulation" }>(
        "/api/v1/subscription/portal",
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      if (payload.portalUrl) {
        if (payload.mode === "simulation") {
          toast.success("Billing portal simulation complete.");
          await loadBillingState();
          emitCreditsRefresh("portal_simulation");
          return;
        }
        window.location.assign(payload.portalUrl);
        return;
      }

      toast.error("Unable to open billing portal.");
    } catch (error) {
      console.error("Failed to open billing portal", {
        error: (error as Error).message,
      });
      toast.error((error as Error).message || "Failed to open billing portal.");
    } finally {
      setIsPortalLoading(false);
    }
  }, [loadBillingState, withSession]);

  const handleCreditPackCheckout = useCallback(async () => {
    setIsCreditCheckoutLoading(true);
    try {
      const payload = await withSession<{ checkoutUrl: string; mode: "stripe" | "simulation" }>(
        "/api/v1/credits/checkout",
        {
          method: "POST",
          body: JSON.stringify({
            packId: "pack_10",
            successUrl: `${window.location.origin}/settings/billing`,
            cancelUrl: `${window.location.origin}/settings/billing`,
          }),
        }
      );

      if (payload.checkoutUrl) {
        if (payload.mode === "simulation") {
          toast.success("Credits granted in simulation mode.");
          await loadBillingState();
          emitCreditsRefresh("credits_checkout_simulation");
          return;
        }
        window.location.assign(payload.checkoutUrl);
        return;
      }

      toast.error("Unable to open credits checkout.");
    } catch (error) {
      console.error("Failed to open credits checkout", {
        error: (error as Error).message,
      });
      toast.error((error as Error).message || "Failed to open credits checkout.");
    } finally {
      setIsCreditCheckoutLoading(false);
    }
  }, [loadBillingState, withSession]);

  return (
    <div className="container max-w-4xl py-6 px-4 sm:px-6 lg:px-8">
      <PageHeader
        title="Billing & Usage"
        description="Manage your plan, credits, and recommendation limits."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Billing & Usage" },
        ]}
      />

      {isLoading && (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Loading billing details...
          </CardContent>
        </Card>
      )}

      {!isLoading && subscription && usage && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Plan
              </CardTitle>
              <CardDescription>Current subscription and billing period.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-lg font-semibold">{subscription.planName}</p>
                <Badge variant={subscription.status === "active" ? "default" : "secondary"}>
                  {formatStatus(subscription.status)}
                </Badge>
                {subscription.cancelAtPeriodEnd && (
                  <Badge variant="outline">Cancels at period end</Badge>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="font-medium">{currency.format(subscription.priceUsd)} / month</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Included recommendations</p>
                  <p className="font-medium">{subscription.includedRecommendations} / month</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Renews on</p>
                  <p className="font-medium">{formatDate(subscription.currentPeriodEnd)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {subscription.planId === "grower_free" && (
                  <>
                    <Button
                      className="gap-2"
                      onClick={() => void handleCheckout("grower")}
                      disabled={isCheckoutLoading}
                    >
                      <Sparkles className="h-4 w-4" />
                      {isCheckoutLoading ? "Opening checkout..." : "Upgrade to Grower ($29)"}
                    </Button>
                    <Button
                      className="gap-2"
                      variant="secondary"
                      onClick={() => void handleCheckout("grower_pro")}
                      disabled={isCheckoutLoading}
                    >
                      <Sparkles className="h-4 w-4" />
                      {isCheckoutLoading ? "Opening checkout..." : "Upgrade to Grower Pro ($45)"}
                    </Button>
                  </>
                )}
                {subscription.planId === "grower" && (
                  <Button
                    className="gap-2"
                    onClick={() => void handleCheckout("grower_pro")}
                    disabled={isCheckoutLoading}
                  >
                    <Sparkles className="h-4 w-4" />
                    {isCheckoutLoading ? "Opening checkout..." : "Upgrade to Grower Pro"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => void handleOpenPortal()}
                  disabled={isPortalLoading}
                >
                  {isPortalLoading ? "Opening portal..." : "Manage Billing"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5" />
                Usage and Credits
              </CardTitle>
              <CardDescription>
                Recommendation usage resets each calendar month. Overage uses credit balance first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">
                    {usage.usedRecommendations} of {usage.includedRecommendations} used
                  </span>
                  <span className="text-muted-foreground">
                    {usage.remainingRecommendations} remaining
                  </span>
                </div>
                <Progress value={usagePercent} />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Credit balance</p>
                  <p className="font-medium">{currency.format(usage.creditsBalanceUsd)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Overage charge</p>
                  <p className="font-medium">{currency.format(usage.overagePriceUsd)} per recommendation</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Credit pack</p>
                  <p className="font-medium">$12 for 10 recommendations</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => void handleCreditPackCheckout()}
                  disabled={isCreditCheckoutLoading}
                >
                  {isCreditCheckoutLoading
                    ? "Opening checkout..."
                    : "Buy 10-credit pack ($12)"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!isLoading && (!subscription || !usage) && (
        <Card>
          <CardContent className="py-8 space-y-3">
            <p className="text-sm text-muted-foreground">
              Billing data is unavailable right now.
            </p>
            <Button variant="outline" onClick={() => void loadBillingState()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
