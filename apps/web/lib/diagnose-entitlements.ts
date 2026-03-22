export type SubscriptionTier = "grower_free" | "grower" | "grower_pro";

export interface DiagnoseTierEntitlements {
  canUsePlanningInputs: boolean;
  canUsePreciseLocation: boolean;
}

export interface PlanningFieldInputValues {
  fieldAcreage?: string;
  plannedApplicationDate?: string;
  fieldLatitude?: string;
  fieldLongitude?: string;
}

export interface PlanningFieldPayload {
  fieldAcreage: number | null;
  plannedApplicationDate: string | null;
  fieldLatitude: number | null;
  fieldLongitude: number | null;
}

export function normalizeSubscriptionTier(value: unknown): SubscriptionTier {
  if (value === "grower" || value === "grower_pro" || value === "grower_free") {
    return value;
  }
  return "grower_free";
}

export function getDiagnoseTierEntitlements(
  tier: SubscriptionTier
): DiagnoseTierEntitlements {
  return {
    canUsePlanningInputs: tier === "grower" || tier === "grower_pro",
    canUsePreciseLocation: tier === "grower_pro",
  };
}

export function planningPayloadFromInputValues(
  input: PlanningFieldInputValues,
  tier: SubscriptionTier
): PlanningFieldPayload {
  const entitlements = getDiagnoseTierEntitlements(tier);
  const acreage = input.fieldAcreage?.trim() ?? "";
  const plannedDate = input.plannedApplicationDate?.trim() ?? "";
  const latitude = input.fieldLatitude?.trim() ?? "";
  const longitude = input.fieldLongitude?.trim() ?? "";

  return {
    fieldAcreage:
      entitlements.canUsePlanningInputs && acreage.length > 0
        ? Number.parseFloat(acreage)
        : null,
    plannedApplicationDate:
      entitlements.canUsePlanningInputs && plannedDate.length > 0 ? plannedDate : null,
    fieldLatitude:
      entitlements.canUsePreciseLocation && latitude.length > 0
        ? Number.parseFloat(latitude)
        : null,
    fieldLongitude:
      entitlements.canUsePreciseLocation && longitude.length > 0
        ? Number.parseFloat(longitude)
        : null,
  };
}
