"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Leaf, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function LandingHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled
          ? "bg-white/95 backdrop-blur-md shadow-sm"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#2C5F2D]">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <span
              className={cn(
                "font-semibold text-lg transition-colors",
                isScrolled ? "text-gray-900" : "text-white"
              )}
            >
              AI Agronomist
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className={cn(
                "text-sm font-medium transition-colors hover:text-[#76C043]",
                isScrolled ? "text-gray-600" : "text-white/80"
              )}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className={cn(
                "text-sm font-medium transition-colors hover:text-[#76C043]",
                isScrolled ? "text-gray-600" : "text-white/80"
              )}
            >
              How It Works
            </a>
            <a
              href="#pricing"
              className={cn(
                "text-sm font-medium transition-colors hover:text-[#76C043]",
                isScrolled ? "text-gray-600" : "text-white/80"
              )}
            >
              Pricing
            </a>
          </nav>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="ghost"
              asChild
              className={cn(
                "transition-colors",
                isScrolled
                  ? "text-gray-700 hover:text-gray-900"
                  : "text-white hover:text-white hover:bg-white/10"
              )}
            >
              <Link href="/login">Sign In</Link>
            </Button>
            <Button
              asChild
              className="bg-[#76C043] hover:bg-[#5fa032] text-white"
            >
              <Link href="/signup">Get Started Free</Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className={cn("w-6 h-6", isScrolled ? "text-gray-900" : "text-white")} />
            ) : (
              <Menu className={cn("w-6 h-6", isScrolled ? "text-gray-900" : "text-white")} />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white rounded-lg shadow-lg mt-2 p-4 space-y-4">
            <a
              href="#features"
              className="block text-gray-700 font-medium py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="block text-gray-700 font-medium py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              How It Works
            </a>
            <a
              href="#pricing"
              className="block text-gray-700 font-medium py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Pricing
            </a>
            <div className="pt-4 border-t space-y-2">
              <Button variant="outline" asChild className="w-full">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild className="w-full bg-[#76C043] hover:bg-[#5fa032]">
                <Link href="/signup">Get Started Free</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
