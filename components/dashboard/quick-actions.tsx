import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, ClipboardList, History } from "lucide-react";

const actions = [
  {
    title: "New Diagnosis",
    description: "Upload a photo or enter lab data",
    icon: Camera,
    href: "/diagnose",
    color: "bg-green-100 text-green-700",
  },
  {
    title: "View Results",
    description: "See your recommendations",
    icon: ClipboardList,
    href: "/recommendations",
    color: "bg-blue-100 text-blue-700",
  },
  {
    title: "History",
    description: "Browse past diagnoses",
    icon: History,
    href: "/history",
    color: "bg-amber-100 text-amber-700",
  },
];

export function QuickActions() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {actions.map((action) => (
          <Link key={action.href} href={action.href}>
            <Card className="h-full transition-all hover:shadow-md hover:border-gray-300 cursor-pointer">
              <CardContent className="p-4">
                <div className={`inline-flex p-2.5 rounded-lg ${action.color} mb-3`}>
                  <action.icon className="w-5 h-5" />
                </div>
                <h3 className="font-medium text-gray-900 mb-1">{action.title}</h3>
                <p className="text-sm text-gray-500">{action.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
