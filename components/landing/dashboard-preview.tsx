"use client";

import {
  Camera,
  ClipboardList,
  Leaf,
  ArrowRight,
  MapPin,
  Sprout,
  Ruler,
  ChevronRight,
  FlaskConical,
} from "lucide-react";

export function DashboardPreview() {
  return (
    <div className="w-full max-w-5xl mx-auto px-4">
      {/* Browser chrome */}
      <div className="rounded-t-xl bg-[#1a1a1a] px-4 py-3 flex items-center gap-3 border-b border-white/5">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="bg-white/5 rounded-md px-4 py-1 text-xs text-white/40 flex items-center gap-2 max-w-xs w-full justify-center">
            <svg
              className="w-3 h-3 text-white/30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            cropcopilot.app/dashboard
          </div>
        </div>
        <div className="w-16" />
      </div>

      {/* Dashboard content — dark theme */}
      <div className="rounded-b-xl bg-earth-950 p-4 sm:p-6 border border-t-0 border-white/5 shadow-2xl">
        {/* Welcome Banner */}
        <div className="relative bg-gradient-to-r from-earth-900 to-earth-800 rounded-xl p-4 sm:p-5 mb-4 sm:mb-5 overflow-hidden border-t-2 border-lime-400/30">
          <div className="absolute top-0 right-0 w-32 h-32 bg-lime-400/5 rounded-full -translate-y-1/2 translate-x-1/4" />
          <div className="relative">
            <h2 className="text-lg sm:text-xl font-bold text-white mb-0.5">
              Good morning,{" "}
              <span className="bg-gradient-to-r from-lime-400 to-lime-300 bg-clip-text text-transparent">
                Sarah!
              </span>
            </h2>
            <p className="text-white/40 text-xs sm:text-sm">
              Monday, June 15, 2026 &bull; Iowa
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-4 sm:mb-5">
          <h3 className="text-sm font-semibold text-white/70 mb-2.5">
            Quick Actions
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              {
                icon: Camera,
                title: "New Diagnosis",
                desc: "Upload a photo or enter lab data",
                accent: true,
              },
              {
                icon: ClipboardList,
                title: "View Results",
                desc: "See your recommendations",
                accent: false,
              },
              {
                icon: FlaskConical,
                title: "Lab Report",
                desc: "Submit soil analysis",
                accent: false,
              },
            ].map((action) => (
              <div
                key={action.title}
                className={`rounded-lg border p-2.5 sm:p-3 ${
                  action.accent
                    ? "bg-lime-400/10 border-lime-400/20"
                    : "bg-white/[0.03] border-white/5"
                }`}
              >
                <div
                  className={`inline-flex p-1.5 sm:p-2 rounded-lg mb-2 ${
                    action.accent
                      ? "bg-lime-400/20 text-lime-400"
                      : "bg-white/5 text-white/50"
                  }`}
                >
                  <action.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <h4
                  className={`font-medium text-xs sm:text-sm mb-0.5 ${
                    action.accent ? "text-lime-400" : "text-white/80"
                  }`}
                >
                  {action.title}
                </h4>
                <p className="text-[10px] sm:text-xs text-white/30 hidden sm:block">
                  {action.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom grid: Recent Recommendations + Farm Profile */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Recent Recommendations */}
          <div className="lg:col-span-2 bg-white/[0.03] rounded-lg border border-white/5 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white/70">
                Recent Recommendations
              </h3>
              <span className="text-xs text-lime-400 flex items-center gap-0.5">
                View all <ArrowRight className="w-3 h-3" />
              </span>
            </div>
            <div className="space-y-2">
              {[
                {
                  crop: "Corn",
                  condition: "Nitrogen Deficiency",
                  time: "2 hours ago",
                  confidence: "High",
                  badgeClass:
                    "bg-lime-400/10 text-lime-400 border-lime-400/20",
                },
                {
                  crop: "Soybeans",
                  condition: "Iron Chlorosis",
                  time: "1 day ago",
                  confidence: "Medium",
                  badgeClass:
                    "bg-blue-400/10 text-blue-400 border-blue-400/20",
                },
                {
                  crop: "Wheat",
                  condition: "Phosphorus Deficiency",
                  time: "3 days ago",
                  confidence: "High",
                  badgeClass:
                    "bg-lime-400/10 text-lime-400 border-lime-400/20",
                },
              ].map((rec) => (
                <div
                  key={rec.condition}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-white/5 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-lime-400/10 shrink-0">
                    <Leaf className="w-4 h-4 text-lime-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-medium text-white/80 capitalize">
                        {rec.crop}
                      </span>
                      <span className="text-white/20 text-xs">&bull;</span>
                      <span className="text-xs text-white/50 truncate">
                        {rec.condition}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-white/30">
                      <span>{rec.time}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] border ${rec.badgeClass}`}
                      >
                        {rec.confidence}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-white/20 shrink-0" />
                </div>
              ))}
            </div>
          </div>

          {/* Farm Profile */}
          <div className="bg-white/[0.03] rounded-lg border border-white/5 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white/70">
                Your Farm Profile
              </h3>
              <span className="text-xs text-lime-400 flex items-center gap-0.5">
                Edit <ChevronRight className="w-3 h-3" />
              </span>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs">
                <MapPin className="w-3.5 h-3.5 text-white/30" />
                <span className="text-white/50">Iowa</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <Sprout className="w-3.5 h-3.5 text-white/30" />
                <span className="text-white/50">Corn, Soybeans, Wheat</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <Ruler className="w-3.5 h-3.5 text-white/30" />
                <span className="text-white/50">500 acres</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
