import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { User, Bell, Shield, HelpCircle, ChevronRight } from "lucide-react";

const settingsItems = [
  {
    title: "Profile",
    description: "Manage your personal information and farm details",
    icon: User,
    href: "/settings/profile",
  },
  {
    title: "Notifications",
    description: "Configure how you receive alerts and updates",
    icon: Bell,
    href: "/settings/notifications",
    disabled: true,
  },
  {
    title: "Privacy & Security",
    description: "Manage your account security and data preferences",
    icon: Shield,
    href: "/settings/security",
    disabled: true,
  },
  {
    title: "Help & Support",
    description: "Get help with using the AI Agronomist Advisor",
    icon: HelpCircle,
    href: "/settings/help",
    disabled: true,
  },
];

export default function SettingsPage() {
  return (
    <div className="container max-w-3xl py-6 px-4 sm:px-6 lg:px-8">
      <PageHeader
        title="Settings"
        description="Manage your account and preferences"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings" },
        ]}
      />

      <div className="space-y-4">
        {settingsItems.map((item) => {
          const content = (
            <Card
              className={`transition-colors ${
                item.disabled
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-gray-50 cursor-pointer"
              }`}
            >
              <CardHeader className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100">
                    <item.icon className="w-5 h-5 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {item.title}
                      {item.disabled && (
                        <span className="text-xs font-normal text-gray-400">
                          Coming soon
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {item.description}
                    </CardDescription>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </CardHeader>
            </Card>
          );

          if (item.disabled) {
            return <div key={item.href}>{content}</div>;
          }

          return (
            <Link key={item.href} href={item.href}>
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
