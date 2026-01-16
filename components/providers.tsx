"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";

/**
 * Providers Component
 *
 * This component wraps the app with various providers:
 * - Theme Provider (for dark mode)
 * - TanStack Query Client (for server state)
 * - Toast Provider (for notifications)
 *
 * Add additional providers as needed in future sessions.
 */

export interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps): JSX.Element {
  return (
    <>
      {children}
      <Toaster position="top-right" richColors />
    </>
  );
}
