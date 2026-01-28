import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentRecommendations } from "@/components/dashboard/recent-recommendations";
import { FarmProfileCard } from "@/components/dashboard/farm-profile-card";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user profile
  const profile = await prisma.userProfile.findUnique({
    where: { userId: user.id },
  });

  // Fetch recent recommendations
  const recommendations = await prisma.recommendation.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 3,
    include: {
      input: {
        select: {
          crop: true,
        },
      },
    },
  });

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
