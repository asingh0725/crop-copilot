"use client";

import {
  Camera,
  ClipboardList,
  History,
  Leaf,
  ArrowRight,
  MapPin,
  Sprout,
  Ruler,
  ChevronRight,
} from "lucide-react";

export function DashboardPreview() {
  return (
    <div className="w-full max-w-5xl mx-auto px-4">
      {/* Browser chrome */}
      <div className="rounded-t-xl bg-[#2a2a2a] px-4 py-3 flex items-center gap-3">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="bg-[#1a1a1a] rounded-md px-4 py-1 text-xs text-gray-400 flex items-center gap-2 max-w-xs w-full justify-center">
            <svg
              className="w-3 h-3 text-gray-500"
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
            aiagronomist.com/dashboard
          </div>
        </div>
        <div className="w-16" />
      </div>

      {/* Dashboard content */}
      <div className="rounded-b-xl bg-gray-50 p-4 sm:p-6 border border-t-0 border-white/10 shadow-2xl">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-xl p-4 sm:p-5 text-white mb-4 sm:mb-5">
          <h2 className="text-lg sm:text-xl font-bold mb-0.5">
            Good morning, Sarah!
          </h2>
          <p className="text-green-100 text-xs sm:text-sm">
            Monday, June 15, 2026 &bull; Iowa
          </p>
        </div>

        {/* Quick Actions */}
        <div className="mb-4 sm:mb-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-2.5">
            Quick Actions
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              {
                icon: Camera,
                title: "New Diagnosis",
                desc: "Upload a photo or enter lab data",
                color: "bg-green-100 text-green-700",
              },
              {
                icon: ClipboardList,
                title: "View Results",
                desc: "See your recommendations",
                color: "bg-blue-100 text-blue-700",
              },
              {
                icon: History,
                title: "History",
                desc: "Browse past diagnoses",
                color: "bg-amber-100 text-amber-700",
              },
            ].map((action) => (
              <div
                key={action.title}
                className="bg-white rounded-lg border border-gray-200 p-2.5 sm:p-3"
              >
                <div
                  className={`inline-flex p-1.5 sm:p-2 rounded-lg ${action.color} mb-2`}
                >
                  <action.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <h4 className="font-medium text-gray-900 text-xs sm:text-sm mb-0.5">
                  {action.title}
                </h4>
                <p className="text-[10px] sm:text-xs text-gray-500 hidden sm:block">
                  {action.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom grid: Recent Recommendations + Farm Profile */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Recent Recommendations */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Recent Recommendations
              </h3>
              <span className="text-xs text-green-600 flex items-center gap-0.5">
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
                  confidenceColor:
                    "bg-green-100 text-green-700 border-green-200",
                },
                {
                  crop: "Soybeans",
                  condition: "Iron Chlorosis",
                  time: "1 day ago",
                  confidence: "Medium",
                  confidenceColor:
                    "bg-amber-100 text-amber-700 border-amber-200",
                },
                {
                  crop: "Wheat",
                  condition: "Phosphorus Deficiency",
                  time: "3 days ago",
                  confidence: "High",
                  confidenceColor:
                    "bg-green-100 text-green-700 border-green-200",
                },
              ].map((rec) => (
                <div
                  key={rec.condition}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 shrink-0">
                    <Leaf className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-medium text-gray-900 capitalize">
                        {rec.crop}
                      </span>
                      <span className="text-gray-300 text-xs">&bull;</span>
                      <span className="text-xs text-gray-600 truncate">
                        {rec.condition}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                      <span>{rec.time}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] border ${rec.confidenceColor}`}
                      >
                        {rec.confidence}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                </div>
              ))}
            </div>
          </div>

          {/* Farm Profile */}
          <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Your Farm Profile
              </h3>
              <span className="text-xs text-green-600 flex items-center gap-0.5">
                Edit <ChevronRight className="w-3 h-3" />
              </span>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-700">Iowa</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <Sprout className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-700">Corn, Soybeans, Wheat</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <Ruler className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-700">500 acres</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
