import { format } from "date-fns";

interface WelcomeBannerProps {
  userName?: string | null;
  location?: string | null;
}

export function WelcomeBanner({ userName, location }: WelcomeBannerProps) {
  const greeting = getGreeting();
  const formattedDate = format(new Date(), "EEEE, MMMM d, yyyy");

  return (
    <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-xl p-6 text-white">
      <h1 className="text-2xl font-bold mb-1">
        {greeting}, {userName || "there"}!
      </h1>
      <p className="text-green-100 text-sm">
        {formattedDate}
        {location && <span className="ml-2">• {location}</span>}
      </p>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
