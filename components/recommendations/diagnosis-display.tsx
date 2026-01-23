"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Diagnosis,
  getConditionTypeLabel,
  getConditionTypeColor,
  getConditionTypeIcon,
} from "@/lib/utils/format-diagnosis";
import {
  ConfidenceIndicator,
  ConfidenceBar,
} from "./confidence-indicator";
import * as Icons from "lucide-react";

interface DiagnosisDisplayProps {
  diagnosis: Diagnosis;
  confidence: number;
}

export function DiagnosisDisplay({
  diagnosis,
  confidence,
}: DiagnosisDisplayProps) {
  const iconName = getConditionTypeIcon(diagnosis.conditionType);
  const Icon = (Icons as any)[iconName] || Icons.HelpCircle;

  return (
    <Card className="border-2">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-2xl font-bold mb-3">
              {diagnosis.condition}
            </CardTitle>
            <Badge
              variant="outline"
              className={`${getConditionTypeColor(diagnosis.conditionType)} px-3 py-1 text-sm font-medium`}
            >
              <Icon className="mr-1.5 h-4 w-4" />
              {getConditionTypeLabel(diagnosis.conditionType)}
            </Badge>
          </div>
          <ConfidenceIndicator confidence={confidence} size="lg" />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Confidence Level
          </h3>
          <ConfidenceBar confidence={confidence} />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Diagnostic Reasoning
          </h3>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
              {diagnosis.reasoning}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
