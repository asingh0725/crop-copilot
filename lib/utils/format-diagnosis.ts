/**
 * Format diagnosis data for display in the UI
 */

export type ConditionType =
  | "deficiency"
  | "disease"
  | "pest"
  | "environmental"
  | "unknown";

export interface Diagnosis {
  condition: string;
  conditionType: ConditionType;
  confidence: number;
  reasoning: string;
}

/**
 * Get human-readable label for condition type
 */
export function getConditionTypeLabel(type: ConditionType): string {
  const labels: Record<ConditionType, string> = {
    deficiency: "Nutrient Deficiency",
    disease: "Plant Disease",
    pest: "Pest Infestation",
    environmental: "Environmental Stress",
    unknown: "Unknown Condition",
  };

  return labels[type] || "Unknown";
}

/**
 * Get color class for condition type
 */
export function getConditionTypeColor(type: ConditionType): string {
  const colors: Record<ConditionType, string> = {
    deficiency: "text-orange-600 bg-orange-50 border-orange-200",
    disease: "text-red-600 bg-red-50 border-red-200",
    pest: "text-purple-600 bg-purple-50 border-purple-200",
    environmental: "text-blue-600 bg-blue-50 border-blue-200",
    unknown: "text-gray-600 bg-gray-50 border-gray-200",
  };

  return colors[type] || colors.unknown;
}

/**
 * Get icon name for condition type (using lucide-react icons)
 */
export function getConditionTypeIcon(type: ConditionType): string {
  const icons: Record<ConditionType, string> = {
    deficiency: "Droplet",
    disease: "AlertCircle",
    pest: "Bug",
    environmental: "Cloud",
    unknown: "HelpCircle",
  };

  return icons[type] || icons.unknown;
}

/**
 * Format confidence as percentage
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Get confidence level label
 */
export function getConfidenceLevel(
  confidence: number
): "low" | "medium" | "high" {
  if (confidence < 0.6) return "low";
  if (confidence < 0.8) return "medium";
  return "high";
}

/**
 * Get color for confidence level
 */
export function getConfidenceColor(confidence: number): string {
  const level = getConfidenceLevel(confidence);

  const colors = {
    low: "text-amber-600 bg-amber-50",
    medium: "text-blue-600 bg-blue-50",
    high: "text-green-600 bg-green-50",
  };

  return colors[level];
}
