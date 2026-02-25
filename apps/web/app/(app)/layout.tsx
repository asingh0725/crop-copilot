import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userName = user?.email?.split("@")[0] || null;

  return (
    <AppShell userName={userName} userEmail={user?.email}>
      {children}
    </AppShell>
  );
}
