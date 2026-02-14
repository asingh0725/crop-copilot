"use client";

import { Toaster } from "sonner";
import { NavigationProgress } from "@/components/ui/navigation-progress";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavigationProgress />
      {children}
      <Toaster position="top-right" richColors />
    </>
  );
}
