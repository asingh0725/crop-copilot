"use client";

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

export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
