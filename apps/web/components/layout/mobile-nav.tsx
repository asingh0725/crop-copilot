"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Camera,
  ClipboardList,
  MoreHorizontal,
  Settings,
  User,
  LogOut,
  Package,
} from "lucide-react";
import { LogoIcon } from "@/components/ui/logo-icon";
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
  { title: "Home", href: "/dashboard", icon: LayoutDashboard },
  { title: "Diagnose", href: "/diagnose", icon: Camera },
  { title: "Results", href: "/recommendations", icon: ClipboardList },
];

const moreNavItems: NavItem[] = [
  { title: "Products", href: "/products", icon: Package },
  { title: "Settings", href: "/settings", icon: Settings },
  { title: "Profile", href: "/settings/profile", icon: User },
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
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <nav className="lg:hidden fixed bottom-4 left-4 right-4 z-50 safe-area-pb">
      <div className="glass-dark rounded-2xl flex items-center justify-around h-16 px-2 shadow-xl shadow-black/20">
        {primaryNavItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-2 gap-1 transition-colors",
                active ? "text-lime-400" : "text-white/40"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.title}</span>
              {active && (
                <div className="absolute bottom-2 w-1 h-1 rounded-full bg-lime-400" />
              )}
            </Link>
          );
        })}

        {/* More Menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-2 gap-1 transition-colors",
                open ? "text-lime-400" : "text-white/40"
              )}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto rounded-t-2xl bg-earth-950 border-white/5">
            <SheetHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-lime-400/10">
                  <LogoIcon size={20} className="text-lime-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-left text-base text-white">
                    {userName || "User"}
                  </SheetTitle>
                  {userEmail && (
                    <p className="text-sm text-white/40 truncate">{userEmail}</p>
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
                        ? "bg-lime-400/10 text-lime-400"
                        : "text-white/60 hover:bg-white/5 hover:text-white/80"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5", active && "text-lime-400")} />
                    <span>{item.title}</span>
                  </Link>
                );
              })}

              <div className="border-t border-white/5 my-2" />

              <Button
                variant="ghost"
                onClick={handleSignOut}
                className="w-full justify-start gap-3 px-3 py-3 h-auto text-red-400 hover:text-red-300 hover:bg-red-500/10"
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
