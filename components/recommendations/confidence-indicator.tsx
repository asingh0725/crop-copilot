"use client";

import {
  formatConfidence,
  getConfidenceLevel,
  getConfidenceColor,
} from "@/lib/utils/format-diagnosis";
import { CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";

interface ConfidenceIndicatorProps {
  confidence: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function ConfidenceIndicator({
  confidence,
  size = "md",
  showLabel = true,
}: ConfidenceIndicatorProps) {
  const level = getConfidenceLevel(confidence);
  const colorClass = getConfidenceColor(confidence);

  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 20,
  };

  const Icon =
    level === "high"
      ? CheckCircle2
      : level === "medium"
        ? AlertCircle
        : HelpCircle;

  return (
    <div className={`inline-flex items-center gap-2 ${sizeClasses[size]}`}>
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium ${colorClass}`}
      >
        <Icon size={iconSizes[size]} />
        <span>{formatConfidence(confidence)}</span>
        {showLabel && <span className="capitalize">{level} confidence</span>}
      </div>
    </div>
  );
}

interface ConfidenceBarProps {
  confidence: number;
}

export function ConfidenceBar({ confidence }: ConfidenceBarProps) {
  const level = getConfidenceLevel(confidence);

  const barColors = {
    low: "bg-amber-500",
    medium: "bg-blue-500",
    high: "bg-green-500",
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">Confidence</span>
        <span className="text-sm font-semibold text-gray-900">
          {formatConfidence(confidence)}
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColors[level]} transition-all duration-300`}
          style={{ width: `${confidence * 100}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-xs text-gray-500">
        <span>50%</span>
        <span>75%</span>
        <span>95%</span>
      </div>
    </div>
  );
}
