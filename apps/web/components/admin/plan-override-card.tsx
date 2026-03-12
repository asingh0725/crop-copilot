"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getBrowserApiBase } from "@/lib/api-client";
import { emitCreditsRefresh } from "@/lib/credits-events";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Tier = "grower_free" | "grower" | "grower_pro";

interface SubscriptionSnapshot {
  planId: Tier;
  planName: string;
  status: "active" | "trialing" | "past_due" | "canceled";
}

interface UsageSnapshot {
  remainingRecommendations: number;
  creditsBalanceUsd: number;
}

const TIER_BUTTONS: Array<{ tier: Tier; label: string }> = [
  { tier: "grower_free", label: "Set Free" },
  { tier: "grower", label: "Set Grower" },
  { tier: "grower_pro", label: "Set Pro" },
];

export function PlanOverrideCard({ currentUserId }: { currentUserId: string }) {
  const [targetUserId, setTargetUserId] = useState(currentUserId);
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTier, setActiveTier] = useState<Tier | null>(null);

  const normalizedTarget = useMemo(() => targetUserId.trim(), [targetUserId]);

  const withSession = useCallback(async <T,>(path: string, init: RequestInit): Promise<T> => {
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
      cache: "no-store",
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof (body as { error?: { message?: string } }).error?.message === "string"
          ? (body as { error: { message: string } }).error.message
          : `Request failed (${response.status})`;
      throw new Error(message);
    }

    return body as T;
  }, []);

  const loadState = useCallback(async () => {
    setIsLoading(true);
    try {
      const [subRes, usageRes] = await Promise.all([
        withSession<{ subscription: SubscriptionSnapshot }>("/api/v1/subscription", { method: "GET" }),
        withSession<{ usage: UsageSnapshot }>("/api/v1/usage", { method: "GET" }),
      ]);

      setSubscription(subRes.subscription);
      setUsage(usageRes.usage);
    } catch (error) {
      console.error("Failed to load admin plan test state", {
        error: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [withSession]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const handleOverride = useCallback(
    async (tier: Tier) => {
      setActiveTier(tier);
      try {
        await withSession<{ success: boolean }>("/api/v1/admin/subscription/override", {
          method: "POST",
          body: JSON.stringify({
            tier,
            userId: normalizedTarget.length > 0 ? normalizedTarget : undefined,
            resetUsage: true,
          }),
        });

        toast.success(`Plan updated to ${tier}`);
        await loadState();
        emitCreditsRefresh("admin_plan_override");
      } catch (error) {
        console.error("Failed to apply admin plan override", {
          tier,
          error: (error as Error).message,
        });
        toast.error((error as Error).message || "Failed to update plan.");
      } finally {
        setActiveTier(null);
      }
    },
    [loadState, normalizedTarget, withSession]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          Admin Plan Scenario Tester
        </CardTitle>
        <CardDescription>
          Override plan entitlement for testing Free, Grower, and Grower Pro scenarios.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="targetUserId">Target User ID</Label>
          <Input
            id="targetUserId"
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value)}
            placeholder="UUID (defaults to your user)"
          />
          <p className="text-xs text-muted-foreground">
            Leave as your own user ID for local testing, or paste another user UUID.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TIER_BUTTONS.map((item) => (
            <Button
              key={item.tier}
              variant={subscription?.planId === item.tier ? "default" : "outline"}
              onClick={() => void handleOverride(item.tier)}
              disabled={activeTier !== null}
            >
              {activeTier === item.tier ? "Applying..." : item.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Current:</span>
          <Badge variant="secondary">{subscription?.planName ?? "Unknown"}</Badge>
          <Badge variant="outline">{subscription?.status ?? "unknown"}</Badge>
          {usage && (
            <span className="text-muted-foreground">
              Remaining monthly: <span className="font-medium text-foreground">{usage.remainingRecommendations}</span> ·
              Credit balance: <span className="font-medium text-foreground">${usage.creditsBalanceUsd.toFixed(2)}</span>
            </span>
          )}
          {isLoading && <span className="text-muted-foreground">Refreshing...</span>}
        </div>
      </CardContent>
    </Card>
  );
}
