import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { timeAgo } from "@/lib/utils/date";
import { ArrowRight, Camera, Leaf } from "lucide-react";
import {
  getConfidenceColor,
  formatConfidence,
} from "@/lib/utils/format-diagnosis";

interface Recommendation {
  id: string;
  createdAt: Date;
  confidence: number;
  diagnosis: unknown;
  input: {
    crop: string | null;
  };
}

interface RecentRecommendationsProps {
  recommendations: Recommendation[];
}

export function RecentRecommendations({ recommendations }: RecentRecommendationsProps) {
  if (recommendations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Recent Recommendations</h2>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Camera}
            title="No recommendations yet"
            description="Start by uploading a photo or entering lab data to get your first diagnosis."
            action={{
              label: "Get Started",
              href: "/diagnose",
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <h2 className="text-lg font-semibold text-gray-900">Recent Recommendations</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/recommendations" className="text-green-600 hover:text-green-700">
            View all
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.map((rec) => {
          const diagnosisData = rec.diagnosis as { diagnosis?: { condition?: string; conditionType?: string } } | null;
          const condition = diagnosisData?.diagnosis?.condition || "Unknown condition";
          const conditionType = diagnosisData?.diagnosis?.conditionType || "unknown";

          return (
            <Link
              key={rec.id}
              href={`/recommendations/${rec.id}`}
              className="block"
            >
              <div className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100 shrink-0">
                  <Leaf className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {rec.input.crop && (
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {rec.input.crop}
                      </span>
                    )}
                    <span className="text-gray-300">•</span>
                    <span className="text-sm text-gray-600 truncate">{condition}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{timeAgo(rec.createdAt)}</span>
                    <Badge
                      variant="outline"
                      className={`${getConfidenceColor(rec.confidence)} text-xs`}
                    >
                      {formatConfidence(rec.confidence)}
                    </Badge>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
