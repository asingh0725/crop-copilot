"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LocateFixed, Search } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { createClient } from "@/lib/supabase/client";
import { getBrowserApiBase } from "@/lib/api-client";
import {
  getDiagnoseTierEntitlements,
  type SubscriptionTier,
} from "@/lib/diagnose-entitlements";
import { LOCATIONS } from "@/lib/constants/profile";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface PlanningLocationFormShape {
  fieldAcreage?: string;
  plannedApplicationDate?: string;
  fieldLatitude?: string;
  fieldLongitude?: string;
  locationState?: string;
  locationCountry?: string;
}

interface LocationMatch {
  displayName: string;
  latitude: number;
  longitude: number;
  countryCode: string | null;
  stateCode: string | null;
  stateName: string | null;
}

interface GeocodeLocationResponse {
  matches?: LocationMatch[];
}

interface ReverseGeocodeLocationResponse {
  match?: LocationMatch | null;
}

interface PlanningLocationFieldsProps {
  form: UseFormReturn<PlanningLocationFormShape>;
  tier: SubscriptionTier;
}

export function PlanningLocationFields({
  form,
  tier,
}: PlanningLocationFieldsProps) {
  const entitlements = useMemo(() => getDiagnoseTierEntitlements(tier), [tier]);
  const [addressQuery, setAddressQuery] = useState("");
  const [isAddressLookupLoading, setIsAddressLookupLoading] = useState(false);
  const [isCurrentLocationLoading, setIsCurrentLocationLoading] = useState(false);

  useEffect(() => {
    if (!entitlements.canUsePlanningInputs) {
      form.setValue("fieldAcreage", "", { shouldDirty: true });
      form.setValue("plannedApplicationDate", "", { shouldDirty: true });
      form.setValue("fieldLatitude", "", { shouldDirty: true });
      form.setValue("fieldLongitude", "", { shouldDirty: true });
      setAddressQuery("");
      return;
    }

    if (!entitlements.canUsePreciseLocation) {
      form.setValue("fieldLatitude", "", { shouldDirty: true });
      form.setValue("fieldLongitude", "", { shouldDirty: true });
      setAddressQuery("");
    }
  }, [entitlements.canUsePlanningInputs, entitlements.canUsePreciseLocation, form]);

  const postWithSession = useCallback(async <T,>(path: string, body: unknown): Promise<T> => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const base = getBrowserApiBase();
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      throw new Error(payload?.error?.message || `Request failed (${response.status})`);
    }

    return (await response.json()) as T;
  }, []);

  const applyLocationMatch = useCallback(
    (match: LocationMatch | null | undefined) => {
      if (!match) {
        return;
      }

      form.setValue("fieldLatitude", match.latitude.toFixed(6), {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("fieldLongitude", match.longitude.toFixed(6), {
        shouldDirty: true,
        shouldValidate: true,
      });

      const normalizedCountry = match.countryCode?.toUpperCase();
      if (normalizedCountry === "US" || normalizedCountry === "CA") {
        form.setValue("locationCountry", normalizedCountry, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }

      const stateName = match.stateName?.trim();
      if (!stateName) {
        return;
      }

      const currentCountry =
        normalizedCountry === "US" || normalizedCountry === "CA"
          ? normalizedCountry
          : (form.getValues("locationCountry") ?? "US");

      const stateOption = LOCATIONS.find(
        (location) =>
          location.country === currentCountry &&
          location.value.toLowerCase() === stateName.toLowerCase()
      );

      if (stateOption) {
        form.setValue("locationState", stateOption.value, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    },
    [form]
  );

  const handleAddressLookup = useCallback(async () => {
    const address = addressQuery.trim();
    if (address.length < 3) {
      toast.error("Enter at least 3 characters for address lookup.");
      return;
    }

    setIsAddressLookupLoading(true);
    try {
      const response = await postWithSession<GeocodeLocationResponse>(
        "/api/v1/location/geocode",
        {
          address,
          limit: 1,
        }
      );

      const match = response.matches?.[0];
      if (!match) {
        toast.error("No location match found. Try a more specific address.");
        return;
      }

      applyLocationMatch(match);
      toast.success("Location coordinates added.");
    } catch (error) {
      console.error("Address lookup failed", {
        error: (error as Error).message,
      });
      toast.error((error as Error).message || "Failed to resolve address.");
    } finally {
      setIsAddressLookupLoading(false);
    }
  }, [addressQuery, applyLocationMatch, postWithSession]);

  const handleUseCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported in this browser.");
      return;
    }

    setIsCurrentLocationLoading(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 60_000,
        });
      });

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      form.setValue("fieldLatitude", latitude.toFixed(6), {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("fieldLongitude", longitude.toFixed(6), {
        shouldDirty: true,
        shouldValidate: true,
      });

      const reverse = await postWithSession<ReverseGeocodeLocationResponse>(
        "/api/v1/location/reverse",
        {
          latitude,
          longitude,
        }
      );
      applyLocationMatch(reverse.match ?? null);
      toast.success("Current field location captured.");
    } catch (error) {
      console.error("Current location lookup failed", {
        error: (error as Error).message,
      });
      toast.error("Unable to capture current location.");
    } finally {
      setIsCurrentLocationLoading(false);
    }
  }, [applyLocationMatch, form, postWithSession]);

  if (!entitlements.canUsePlanningInputs) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Application planning is locked on Grower Free.</p>
        <p className="mt-1">
          Upgrade to Grower to include field acreage and planned date, or Grower Pro for precise
          location tools.
        </p>
        <Link href="/settings/billing" className="mt-2 inline-block underline">
          View plans
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">Application Planning</h3>
        <p className="text-sm text-muted-foreground">
          Add planning context for stronger cost and compliance outputs.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="fieldAcreage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Field Acreage (optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g. 120" {...field} />
              </FormControl>
              <FormDescription>Used for whole-field cost projections.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="plannedApplicationDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Planned Application Date (optional)</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormDescription>Used for timing-aware guidance.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {!entitlements.canUsePreciseLocation && (
        <div className="rounded-md border border-dashed border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Precise field location (GPS + address lookup) is available on Grower Pro.
          <Link href="/settings/billing" className="ml-1 underline">
            Upgrade
          </Link>
        </div>
      )}

      {entitlements.canUsePreciseLocation && (
        <div className="space-y-4 rounded-md border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-emerald-900">Field Location (Grower Pro)</p>
            <p className="text-xs text-emerald-800">
              Use current GPS or resolve an address, then fine-tune coordinates manually.
            </p>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <Input
              placeholder="Enter address, farm, or landmark"
              value={addressQuery}
              onChange={(event) => setAddressQuery(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleAddressLookup()}
              disabled={isAddressLookupLoading}
              className="gap-1"
            >
              <Search className="h-4 w-4" />
              {isAddressLookupLoading ? "Looking up..." : "Lookup Address"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleUseCurrentLocation()}
              disabled={isCurrentLocationLoading}
              className="gap-1"
            >
              <LocateFixed className="h-4 w-4" />
              {isCurrentLocationLoading ? "Locating..." : "Use Current"}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="fieldLatitude"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Latitude (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 41.878100" {...field} />
                  </FormControl>
                  <FormDescription>Required for spray-window weather checks.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fieldLongitude"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Longitude (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. -93.097700" {...field} />
                  </FormControl>
                  <FormDescription>Required for spray-window weather checks.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
