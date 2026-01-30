import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  XCircle,
  MinusCircle,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function FeedbackHistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const feedbacks = await prisma.feedback.findMany({
    where: { userId: user.id },
    include: {
      recommendation: {
        include: {
          input: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Feedback</h1>
        <p className="text-gray-600 mt-2">
          View all feedback you&apos;ve provided on recommendations
        </p>
      </div>

      <div className="space-y-4">
        {feedbacks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No feedback yet
              </h3>
              <p className="text-gray-500 mb-4">
                You haven&apos;t provided any feedback on recommendations yet.
              </p>
              <Link
                href="/recommendations"
                className="inline-flex items-center text-[#76C043] hover:underline"
              >
                View your recommendations
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </CardContent>
          </Card>
        ) : (
          feedbacks.map((feedback) => {
            const diagnosis = feedback.recommendation.diagnosis as Record<
              string,
              unknown
            >;
            const diagnosisTitle =
              (diagnosis?.condition as string) ||
              (diagnosis?.diagnosis as string) ||
              (diagnosis?.title as string) ||
              "Recommendation";

            return (
              <Card key={feedback.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <Link
                        href={`/recommendations/${feedback.recommendationId}`}
                        className="text-lg font-semibold text-gray-900 hover:text-[#76C043] hover:underline line-clamp-1"
                      >
                        {diagnosisTitle}
                      </Link>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        {feedback.recommendation.input.crop && (
                          <span className="capitalize">
                            {feedback.recommendation.input.crop}
                          </span>
                        )}
                        <span>•</span>
                        <span>
                          {new Date(feedback.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            }
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {feedback.helpful !== null && (
                        <Badge
                          variant={feedback.helpful ? "default" : "secondary"}
                          className={
                            feedback.helpful
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                          }
                        >
                          {feedback.helpful ? (
                            <>
                              <ThumbsUp className="h-3 w-3 mr-1" />
                              Helpful
                            </>
                          ) : (
                            <>
                              <ThumbsDown className="h-3 w-3 mr-1" />
                              Not Helpful
                            </>
                          )}
                        </Badge>
                      )}
                      {feedback.outcomeReported && (
                        <Badge variant="outline">Outcome Reported</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Ratings */}
                  {(feedback.rating || feedback.accuracy) && (
                    <div className="flex flex-wrap gap-6">
                      {feedback.rating && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">Overall:</span>
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-4 w-4 ${
                                  star <= feedback.rating!
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-gray-300"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {feedback.accuracy && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">Accuracy:</span>
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-4 w-4 ${
                                  star <= feedback.accuracy!
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-gray-300"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Comments */}
                  {feedback.comments && (
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-700">{feedback.comments}</p>
                    </div>
                  )}

                  {/* Issues */}
                  {feedback.issues &&
                    Array.isArray(feedback.issues) &&
                    feedback.issues.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(feedback.issues as string[]).map((issue) => (
                          <Badge key={issue} variant="outline" className="text-xs">
                            {issue.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    )}

                  {/* Outcome */}
                  {feedback.outcomeReported && (
                    <div className="border-t pt-4 mt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-700">
                          Outcome:
                        </span>
                        {feedback.outcomeSuccess === true && (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Worked
                          </Badge>
                        )}
                        {feedback.outcomeSuccess === false && (
                          <Badge className="bg-red-100 text-red-700">
                            <XCircle className="h-3 w-3 mr-1" />
                            Did Not Work
                          </Badge>
                        )}
                        {feedback.outcomeSuccess === null && feedback.outcomeApplied && (
                          <Badge className="bg-yellow-100 text-yellow-700">
                            <MinusCircle className="h-3 w-3 mr-1" />
                            Partially Worked
                          </Badge>
                        )}
                        {feedback.outcomeApplied === false && (
                          <Badge variant="secondary">Not Applied</Badge>
                        )}
                      </div>
                      {feedback.outcomeNotes && (
                        <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                          {feedback.outcomeNotes}
                        </p>
                      )}
                      {feedback.outcomeTimestamp && (
                        <p className="text-xs text-gray-400 mt-2">
                          Reported on{" "}
                          {new Date(feedback.outcomeTimestamp).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            }
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
