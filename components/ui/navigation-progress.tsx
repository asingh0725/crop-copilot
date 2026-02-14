"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";

export function NavigationProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevPathname = useRef(pathname);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (pathname === prevPathname.current) return;
    prevPathname.current = pathname;

    // Clear any pending hide timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Start progress animation
    setVisible(true);
    setProgress(0);

    // Quickly jump to ~70%
    requestAnimationFrame(() => {
      setProgress(70);
    });

    // Complete to 100% then hide
    const completeTimer = setTimeout(() => {
      setProgress(100);
      timeoutRef.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
    }, 150);

    return () => {
      clearTimeout(completeTimer);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [pathname]);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] h-[2px] pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 300ms" }}
    >
      <div
        className="h-full bg-lime-400 shadow-[0_0_8px_rgba(118,192,67,0.5)]"
        style={{
          width: `${progress}%`,
          transition: progress === 0
            ? "none"
            : progress < 100
              ? "width 400ms cubic-bezier(0.4, 0, 0.2, 1)"
              : "width 150ms ease-out",
        }}
      />
    </div>
  );
}
