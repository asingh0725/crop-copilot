import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Sprout, Ruler, ChevronRight, AlertCircle } from "lucide-react";

interface FarmProfileCardProps {
  profile: {
    location: string | null;
    farmSize: string | null;
    cropsOfInterest: string[];
    experienceLevel: string | null;
  } | null;
}

export function FarmProfileCard({ profile }: FarmProfileCardProps) {
  const isProfileComplete = profile && (profile.location || profile.cropsOfInterest.length > 0);

  if (!isProfileComplete) {
    return (
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 mb-1">Complete Your Profile</h3>
              <p className="text-sm text-gray-600 mb-3">
                Add your location and crops to get more relevant recommendations.
              </p>
              <Button size="sm" asChild>
                <Link href="/settings/profile">
                  Complete Profile
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <h2 className="text-lg font-semibold text-gray-900">Your Farm Profile</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings/profile" className="text-green-600 hover:text-green-700">
            Edit
            <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.location && (
          <div className="flex items-center gap-3 text-sm">
            <MapPin className="w-4 h-4 text-gray-400" />
            <span className="text-gray-700">{profile.location}</span>
          </div>
        )}
        {profile.cropsOfInterest.length > 0 && (
          <div className="flex items-center gap-3 text-sm">
            <Sprout className="w-4 h-4 text-gray-400" />
            <span className="text-gray-700 capitalize">
              {profile.cropsOfInterest.join(", ")}
            </span>
          </div>
        )}
        {profile.farmSize && (
          <div className="flex items-center gap-3 text-sm">
            <Ruler className="w-4 h-4 text-gray-400" />
            <span className="text-gray-700">{profile.farmSize}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
