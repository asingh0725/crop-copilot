"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { PlanCreditsBadge } from "./plan-credits-badge";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  isAdmin?: boolean;
}

export function AppShell({ children, userName, userEmail, isAdmin = false }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <PlanCreditsBadge />

      {/* Desktop Sidebar */}
      <Sidebar
        userName={userName}
        userEmail={userEmail}
        isAdmin={isAdmin}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />

      {/* Main Content */}
      <main
        className={cn(
          "min-h-screen transition-all duration-300",
          "lg:ml-64", // Default margin for expanded sidebar
          sidebarCollapsed && "lg:ml-16" // Reduced margin when collapsed
        )}
      >
        <div className="pb-20 lg:pb-0">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav userName={userName} userEmail={userEmail} isAdmin={isAdmin} />
    </div>
  );
}
