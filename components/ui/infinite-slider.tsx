"use client";

import { type ReactNode } from "react";

interface InfiniteSliderProps {
  children: ReactNode[];
  className?: string;
  speed?: number;
}

export function InfiniteSlider({
  children,
  className = "",
  speed = 30,
}: InfiniteSliderProps) {
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
      }}
    >
      <div
        className="flex gap-6 hover:[animation-play-state:paused]"
        style={{
          animation: `slide-infinite ${speed}s linear infinite`,
          width: "max-content",
        }}
      >
        {children}
        {children}
      </div>
    </div>
  );
}
