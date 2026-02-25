import { createClient } from "@/lib/supabase/server";
import { createApiClient } from "@/lib/api-client";
import { redirect } from "next/navigation";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentRecommendations } from "@/components/dashboard/recent-recommendations";
import { FarmProfileCard } from "@/components/dashboard/farm-profile-card";

interface LambdaProfile {
  userId: string;
  location: string | null;
  farmSize: string | null;
  cropsOfInterest: string[];
  experienceLevel: string | null;
}

interface LambdaRecommendation {
  id: string;
  createdAt: string;
  confidence: number;
  condition: string;
  conditionType: string;
  input: { crop: string | null };
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const client = createApiClient(session?.access_token ?? "");

  const [profileResult, recResult] = await Promise.allSettled([
    client.get<{ profile: LambdaProfile }>("/api/v1/profile"),
    client.get<{ recommendations: LambdaRecommendation[] }>(
      "/api/v1/recommendations?page=1&pageSize=3&sort=date_desc"
    ),
  ]);

  const profile =
    profileResult.status === "fulfilled" ? profileResult.value.profile : null;
  const rawRecs =
    recResult.status === "fulfilled" ? recResult.value.recommendations : [];

  const recommendations = rawRecs.map((r) => ({
    id: r.id,
    createdAt: new Date(r.createdAt),
    confidence: r.confidence,
    diagnosis: {
      diagnosis: { condition: r.condition, conditionType: r.conditionType },
    },
    input: { crop: r.input.crop },
  }));

  const userName = user.email?.split("@")[0] || null;

  return (
    <div className="container max-w-5xl py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      <WelcomeBanner userName={userName} location={profile?.location} />

      <QuickActions />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentRecommendations recommendations={recommendations} />
        </div>
        <div>
          <FarmProfileCard profile={profile} />
        </div>
      </div>
    </div>
  );
}
