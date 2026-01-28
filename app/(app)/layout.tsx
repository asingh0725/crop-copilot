import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch user profile for display name
  let userName: string | null = null;
  if (user) {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: { location: true },
    });
    // Use email username as display name if no profile name
    userName = user.email?.split("@")[0] || null;
  }

  return (
    <AppShell userName={userName} userEmail={user?.email}>
      {children}
    </AppShell>
  );
}
