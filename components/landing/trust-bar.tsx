"use client";

import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { GraduationCap } from "lucide-react";
import { MotionDiv } from "./motion-wrapper";

const partners = [
  "Iowa State",
  "Purdue",
  "UMN",
  "K-State",
  "Nebraska",
  "Ohio State",
  "Michigan State",
  "Penn State",
  "Cornell",
  "UC Davis",
  "Texas A&M",
  "Wisconsin",
  "Illinois",
  "North Dakota State",
  "South Dakota State",
];

export function TrustBar() {
  return (
    <section
      id="trust"
      className="py-10 bg-[#142a1e] border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MotionDiv>
          <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-10">
            {/* Left text */}
            <div className="flex items-center gap-3 shrink-0">
              <GraduationCap className="w-5 h-5 text-hero-accent" />
              <p className="text-sm text-white/50 font-medium whitespace-nowrap">
                Research sourced from leading agricultural universities
              </p>
            </div>

            {/* Divider */}
            <div className="hidden lg:block w-px h-8 bg-white/10" />

            {/* Infinite slider */}
            <InfiniteSlider speed={40} className="flex-1 w-full lg:w-auto">
              {partners.map((name) => (
                <div
                  key={name}
                  className="glass rounded-full px-5 py-2 text-white/70 text-sm font-medium whitespace-nowrap shrink-0"
                >
                  {name}
                </div>
              ))}
            </InfiniteSlider>
          </div>
        </MotionDiv>
      </div>
    </section>
  );
}
