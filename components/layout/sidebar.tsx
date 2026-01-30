"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Camera,
  ClipboardList,
  History,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Leaf,
  User,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const mainNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Diagnose",
    href: "/diagnose",
    icon: Camera,
  },
  {
    title: "Recommendations",
    href: "/recommendations",
    icon: ClipboardList,
  },
  {
    title: "Products",
    href: "/products",
    icon: Package,
  },
  {
    title: "History",
    href: "/history",
    icon: History,
  },
];

const bottomNavItems: NavItem[] = [
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
  {
    title: "Profile",
    href: "/settings/profile",
    icon: User,
  },
];

interface SidebarProps {
  userName?: string | null;
  userEmail?: string | null;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function Sidebar({ userName, userEmail, collapsed, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-white border-r border-gray-200 transition-all duration-300 z-40",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo/Brand */}
        <div className={cn(
          "flex items-center h-16 border-b border-gray-200 px-4",
          collapsed ? "justify-center" : "gap-3"
        )}>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-600">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-gray-900 truncate">
              AI Agronomist
            </span>
          )}
        </div>

        {/* User Info */}
        {!collapsed && (userName || userEmail) && (
          <div className="px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-900 truncate">
              {userName || "User"}
            </p>
            {userEmail && (
              <p className="text-xs text-gray-500 truncate">{userEmail}</p>
            )}
          </div>
        )}

        {/* Main Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {mainNavItems.map((item) => {
            const active = isActive(item.href);
            const NavLink = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-green-50 text-green-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  collapsed && "justify-center"
                )}
              >
                <item.icon className={cn("w-5 h-5 shrink-0", active && "text-green-600")} />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{NavLink}</TooltipTrigger>
                  <TooltipContent side="right">{item.title}</TooltipContent>
                </Tooltip>
              );
            }

            return NavLink;
          })}
        </nav>

        {/* Bottom Navigation */}
        <div className="px-2 py-4 border-t border-gray-200 space-y-1">
          {bottomNavItems.map((item) => {
            const active = isActive(item.href);
            const NavLink = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-green-50 text-green-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  collapsed && "justify-center"
                )}
              >
                <item.icon className={cn("w-5 h-5 shrink-0", active && "text-green-600")} />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{NavLink}</TooltipTrigger>
                  <TooltipContent side="right">{item.title}</TooltipContent>
                </Tooltip>
              );
            }

            return NavLink;
          })}

          {/* Sign Out */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="w-full justify-center text-gray-600 hover:text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign Out</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="w-full justify-start gap-3 px-3 text-gray-600 hover:text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </Button>
          )}
        </div>

        {/* Collapse Toggle */}
        <div className="px-2 py-2 border-t border-gray-200">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCollapsedChange(!collapsed)}
            className={cn(
              "w-full text-gray-500 hover:text-gray-700",
              collapsed ? "justify-center" : "justify-end"
            )}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <span className="text-xs mr-2">Collapse</span>
                <ChevronLeft className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
