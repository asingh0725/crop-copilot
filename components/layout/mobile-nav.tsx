"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Camera,
  ClipboardList,
  MoreHorizontal,
  History,
  Settings,
  User,
  LogOut,
  X,
  Leaf,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const primaryNavItems: NavItem[] = [
  {
    title: "Home",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Diagnose",
    href: "/diagnose",
    icon: Camera,
  },
  {
    title: "Results",
    href: "/recommendations",
    icon: ClipboardList,
  },
];

const moreNavItems: NavItem[] = [
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

interface MobileNavProps {
  userName?: string | null;
  userEmail?: string | null;
}

export function MobileNav({ userName, userEmail }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
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
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-pb">
      <div className="flex items-center justify-around h-16 px-2">
        {primaryNavItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-2 gap-1 transition-colors",
                active ? "text-green-600" : "text-gray-500"
              )}
            >
              <item.icon className={cn("w-5 h-5", active && "text-green-600")} />
              <span className="text-[10px] font-medium">{item.title}</span>
            </Link>
          );
        })}

        {/* More Menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-2 gap-1 transition-colors",
                open ? "text-green-600" : "text-gray-500"
              )}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto rounded-t-2xl">
            <SheetHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100">
                  <Leaf className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-left text-base">
                    {userName || "User"}
                  </SheetTitle>
                  {userEmail && (
                    <p className="text-sm text-gray-500 truncate">{userEmail}</p>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-1 pb-4">
              {moreNavItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors",
                      active
                        ? "bg-green-50 text-green-700"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5", active && "text-green-600")} />
                    <span>{item.title}</span>
                  </Link>
                );
              })}

              <div className="border-t border-gray-200 my-2" />

              <Button
                variant="ghost"
                onClick={handleSignOut}
                className="w-full justify-start gap-3 px-3 py-3 h-auto text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <LogOut className="w-5 h-5" />
                <span>Sign Out</span>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
