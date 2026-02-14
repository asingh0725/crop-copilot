"use client";

import { Sprout } from "lucide-react";

interface WelcomeBannerProps {
  userName?: string | null;
  location?: string | null;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function WelcomeBanner({ userName, location }: WelcomeBannerProps) {
  const greeting = getGreeting();
  const formattedDate = formatDate(new Date());

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-earth-900 via-earth-800 to-earth-900 p-6 text-white border border-lime-400/10 animate-in fade-in slide-in-from-bottom-2 duration-400"
    >
      {/* Accent top border */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-lime-400/0 via-lime-400/60 to-lime-400/0" />

      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-48 h-48 opacity-5">
        <div className="w-full h-full rounded-full bg-lime-400 blur-3xl" />
      </div>

      <div className="relative flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            {greeting},{" "}
            <span className="text-gradient">{userName || "there"}</span>!
          </h1>
          <p className="text-white/40 text-sm">
            {formattedDate}
            {location && <span className="ml-2">&bull; {location}</span>}
          </p>
        </div>

        <div className="hidden sm:flex items-center justify-center w-14 h-14 rounded-2xl bg-lime-400/10 border border-lime-400/20">
          <Sprout className="w-7 h-7 text-lime-400 animate-float" />
        </div>
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
